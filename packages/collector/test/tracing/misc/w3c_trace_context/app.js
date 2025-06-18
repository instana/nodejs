/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

/**
 * This application can either act as a service instrumented by Instana or as a service instrumented by different, W3C
 * trace context compliant vendor. In the latter case, it can either forward the trace or participate in it.
 *
 * In either case, a series of requests is usually started by GET /start?depth=d, which will in turn send a request to
 * the downstream service at GET /continue?depth=(d-1). When d reaches 1, the last request will go to GET /end.
 */

const vendor = process.env.APM_VENDOR;
const useHttp2 = process.env.APP_USES_HTTP2 ? process.env.APP_USES_HTTP2 === 'true' : false;

let vendorLabel;
if (!vendor) {
  throw new Error('APM_VENDOR is mandatory for this app.');
}
if (vendor === 'instana') {
  vendorLabel = 'Instana';
} else if (vendor === 'other-spec-compliant') {
  vendorLabel = 'Other Vendor (compliant)';
} else if (vendor === 'other-non-spec-compliant') {
  vendorLabel = 'Other Vendor (non-compliant)';
} else {
  throw new Error('APM_VENDOR must be either "instana" or "other-spec-compliant" or "other-non-spec-compliant".');
}

let cls;
if (isInstana()) {
  require('../../../..')();
  cls = require('../../../../../core/src/tracing/cls');
}

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch-v2');
const { parse } = require('url');

const http2Promise = require('../../../test_util/http2Promise');

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = require('http2').constants;

const tracingUtil = require('../../../../../core/src/tracing/tracingUtil');

const port = require('../../../test_util/app-port')();
const downstreamPort = process.env.DOWNSTREAM_PORT;

const otherVendorTraceStateKey = 'other';
const logPrefix = `${vendorLabel} (${useHttp2 ? 'HTTP2' : 'HTTP1'}) (${process.pid}):\t`;

if (!port) {
  throw new Error('APP_PORT is mandatory for this app.');
}

if (!downstreamPort) {
  throw new Error('DOWNSTREAM_PORT is mandatory for this app.');
}

if (useHttp2) {
  // HTTP 2

  const http2 = require('http2');

  const sslDir = path.join(__dirname, '..', '..', '..', 'apps', 'ssl');

  const server = http2.createSecureServer({
    key: fs.readFileSync(path.join(sslDir, 'key')),
    cert: fs.readFileSync(path.join(sslDir, 'cert'))
  });

  server.on('error', err => {
    log('HTTP2 server error', err);
  });

  server.on('stream', (stream, headers) => {
    handleRequest(headers, headers[HTTP2_HEADER_METHOD] || 'GET', headers[HTTP2_HEADER_PATH] || '/', stream);
  });

  server.listen(port, () => {
    log(`Listening (HTTP2) on port: ${port}`);
  });
} else {
  // HTTP 1.1

  const server = require('http')
    .createServer()
    .listen(port, () => {
      log(`Listening  on port: ${port}`);
    });

  server.on('request', (req, res) => handleRequest(req.headers, req.method, req.url, res));
}

function handleRequest(incomingHeaders, method, url, resOrStream) {
  const loggedHeaders = Object.assign({}, incomingHeaders);
  delete loggedHeaders.host;
  delete loggedHeaders.accept;
  delete loggedHeaders.connection;

  if (process.env.WITH_STDOUT) {
    log(`-> ${method} ${url} ${JSON.stringify(loggedHeaders)}`);
  }

  const { pathname, query } = parse(url, true);

  const outgoingHeaders = {};

  if (isOtherSpecCompliant()) {
    const incomingTraceParent = incomingHeaders.traceparent;
    const incomingTraceState = incomingHeaders.tracestate;
    const newParentId = tracingUtil.generateRandomSpanId();
    const otherMode = query.otherMode || 'participate';
    if (otherMode === 'forward') {
      outgoingHeaders.traceparent = incomingTraceParent;
      outgoingHeaders.tracestate = incomingTraceState;
    } else if (otherMode === 'participate') {
      if (incomingTraceParent && incomingTraceState) {
        // participate in existing trace by updating traceparent and tracestate
        outgoingHeaders.traceparent = `${incomingTraceParent.substring(0, 36)}${newParentId}-01`;
        // Not fully spec compliant because we do not remove existing "other" key-value pairs, but that's irrelevant for
        // this test.
        outgoingHeaders.tracestate = `${otherVendorTraceStateKey}=newParentId,${incomingTraceState}`;
      } else {
        // start a new trace by creating traceparent and tracestate
        const newTraceId = tracingUtil.generateRandomLongTraceId();
        outgoingHeaders.traceparent = `00-${newTraceId}-${newParentId}-01`;
        outgoingHeaders.tracestate = `${otherVendorTraceStateKey}=newParentId`;
      }
    } else if (otherMode === 'soft-restart') {
      // soft-restart the trace by creating traceparent with new values but keep tracestate
      const newTraceId = tracingUtil.generateRandomLongTraceId();
      outgoingHeaders.traceparent = `00-${newTraceId}-${newParentId}-01`;
      outgoingHeaders.tracestate = `${otherVendorTraceStateKey}=newParentId,${incomingTraceState}`;
    } else if (otherMode === 'hard-restart') {
      // hard-restart the trace by creating traceparent and tracestate and discarding previous tracestate values
      const newTraceId = tracingUtil.generateRandomLongTraceId();
      outgoingHeaders.traceparent = `00-${newTraceId}-${newParentId}-01`;
      outgoingHeaders.tracestate = `${otherVendorTraceStateKey}=newParentId`;
    } else if (otherMode === 'non-compliant') {
      // Nothing to do, we do not pass down headers.
    } else {
      // eslint-disable-next-line no-console
      console.error(`Unknown otherMode: ${otherMode}`);
      return endWithStatus(method, url, resOrStream, 400);
    }
  }

  const depth = parseInt(query.depth || '1', 10);
  query.depth = depth - 1;
  let downstreamPath;
  if (pathname === '/') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }
    return endWithStatus(method, url, resOrStream, 200);
  } else if (pathname === '/start' || pathname === '/continue') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }
    downstreamPath = depth > 1 ? 'continue' : 'end';
    const requestOptions = {
      method,
      headers: outgoingHeaders,
      qs: query
    };
    if (useHttp2) {
      requestOptions.baseUrl = `https://localhost:${downstreamPort}`;
      requestOptions.path = `/${downstreamPath}`;
    } else {
      const queryString = Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : '';
      requestOptions.uri = `http://localhost:${downstreamPort}/${downstreamPath}${queryString}`;
    }
    const request = useHttp2
      ? http2Promise.request(requestOptions)
      : fetch(requestOptions.uri, requestOptions).then(response => response.text());
    return request
      .then(response => endWithPayload(method, url, resOrStream, response))
      .catch(e => endWithError(method, url, resOrStream, e));
  } else if (pathname === '/end') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }
    const payload = {
      w3cTraceContext: {
        receivedHeaders: {
          traceparent: incomingHeaders.traceparent,
          tracestate: incomingHeaders.tracestate
        }
      }
    };
    if (incomingHeaders['x-instana-t'] || incomingHeaders['x-instana-s'] || incomingHeaders['x-instana-l']) {
      payload.instanaHeaders = {
        t: incomingHeaders['x-instana-t'],
        s: incomingHeaders['x-instana-s'],
        l: incomingHeaders['x-instana-l']
      };
    }
    if (isInstana()) {
      const activeW3cTraceContext = cls.getW3cTraceContext();
      if (activeW3cTraceContext) {
        payload.w3cTraceContext.active = {
          instanaTraceId: activeW3cTraceContext.instanaTraceId,
          instanaParentId: activeW3cTraceContext.instanaParentId
        };
      }
    }
    return endWithPayload(method, url, resOrStream, JSON.stringify(payload));
  }

  return endWithStatus(method, url, resOrStream, 404);
}

function endWithPayload(method, url, resOrStream, payload) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> 200`);
  }
  if (useHttp2) {
    if (typeof payload === 'object') {
      payload = JSON.stringify(payload);
    }
    resOrStream.respond({
      [HTTP2_HEADER_STATUS]: 200
    });
  } else {
    resOrStream.statusCode = 200;
  }
  resOrStream.end(payload);
}

function endWithError(method, url, resOrStream, error) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> 500 – ${error}`);
  }
  // eslint-disable-next-line no-console
  console.error(error);
  _endWithStatus(method, url, resOrStream, 500);
}

function endWithStatus(method, url, resOrStream, statusCode) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> ${statusCode}`);
  }
  _endWithStatus(method, url, resOrStream, statusCode);
}

function _endWithStatus(method, url, resOrStream, statusCode) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> ${statusCode}`);
  }
  if (useHttp2) {
    resOrStream.respond({
      [HTTP2_HEADER_STATUS]: statusCode
    });
  } else {
    resOrStream.statusCode = statusCode;
  }
  resOrStream.end();
}

function isInstana() {
  return vendor === 'instana';
}

function isOtherSpecCompliant() {
  return vendor === 'other-spec-compliant';
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
