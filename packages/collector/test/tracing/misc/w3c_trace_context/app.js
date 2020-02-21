'use strict';

/**
 * This application can either act as a service instrumented by Instana or as a service instrumented by different, W3C
 * trace context compliant vendor. In the latter case, it can either forward the trace or participate in it.
 *
 * In either case, a series of requests is usually started by GET /start?depth=d, which will in turn send a request to
 * the downstream service at GET /continue?depth=(d-1). When d reaches 1, the last request will go to GET /end.
 */

const vendor = process.env.APM_VENDOR;

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
  require('../../../../')();
  cls = require('../../../../../core/src/tracing/cls');
}

const rp = require('request-promise');
const url = require('url');

const tracingUtil = require('../../../../../core/src/tracing/tracingUtil');

const port = process.env.APP_PORT;
const downstreamPort = process.env.DOWNSTREAM_PORT;

const otherVendorTraceStateKey = 'other';
const logPrefix = `${vendorLabel} (${process.pid}):\t`;

if (!port) {
  throw new Error('APP_PORT is mandatory for this app.');
}

if (!downstreamPort) {
  throw new Error('DOWNSTREAM_PORT is mandatory for this app.');
}

let server = require('http')
  .createServer()
  .listen(port, () => {
    log(`Listening  on port: ${port}`);
  });

server.on('request', (req, res) => {
  const incomingHeaders = req.headers;
  const loggedHeaders = Object.assign({}, incomingHeaders);
  delete loggedHeaders.host;
  delete loggedHeaders.accept;
  delete loggedHeaders.connection;

  if (process.env.WITH_STDOUT) {
    log(`-> ${req.method} ${req.url} ${JSON.stringify(loggedHeaders)}`);
  }

  const { pathname, query } = url.parse(req.url, true);

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
      return endWithStatus(req, res, 400);
    }
  }

  const depth = parseInt(query.depth || '1', 10);
  query.depth = depth - 1;
  let downstreamPath;
  if (pathname === '/') {
    if (req.method !== 'GET') {
      return endWithStatus(req, res, 405);
    }
    return endWithStatus(req, res, 200);
  } else if (pathname === '/start') {
    if (req.method !== 'GET') {
      return endWithStatus(req, res, 405);
    }
    downstreamPath = depth > 1 ? 'continue' : 'end';
    return rp
      .get({
        uri: `http://127.0.0.1:${downstreamPort}/${downstreamPath}`,
        headers: outgoingHeaders,
        qs: query
      })
      .then(response => {
        return endWithPayload(req, res, response);
      })
      .catch(e => {
        return endWithError(req, res, e);
      });
  } else if (pathname === '/continue') {
    if (req.method !== 'GET') {
      return endWithStatus(req, res, 405);
    }
    downstreamPath = depth > 1 ? 'continue' : 'end';
    return rp
      .get({
        uri: `http://127.0.0.1:${downstreamPort}/${downstreamPath}`,
        headers: outgoingHeaders,
        qs: query
      })
      .then(response => {
        return endWithPayload(req, res, response);
      })
      .catch(e => {
        return endWithError(req, res, e);
      });
  } else if (pathname === '/end') {
    if (req.method !== 'GET') {
      return endWithStatus(req, res, 405);
    }
    const payload = {
      w3cTaceContext: {
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
        payload.w3cTaceContext.active = {
          instanaTraceId: activeW3cTraceContext.instanaTraceId,
          instanaParentId: activeW3cTraceContext.instanaParentId
        };
      }
    }
    return endWithPayload(req, res, JSON.stringify(payload));
  }

  return endWithStatus(req, res, 404);
});

function endWithStatus(req, res, statusCode) {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url} -> ${statusCode}`);
  }
  res.statusCode = statusCode;
  res.end();
}

function endWithPayload(req, res, payload) {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url} -> 200`);
  }
  res.end(payload);
}

function endWithError(req, res, error) {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url} -> 500 – ${error}`);
  }
  res.statusCode = 500;
  res.end();
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
