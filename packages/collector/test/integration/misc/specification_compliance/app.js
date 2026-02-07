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

const useHttp2 = process.env.APP_USES_HTTP2 ? process.env.APP_USES_HTTP2 === 'true' : false;
const useNativeFetch = process.env.USE_NATIVE_FETCH ? process.env.USE_NATIVE_FETCH === 'true' : false;

require('@instana/collector')();

const fs = require('fs');
const path = require('path');

const { parse } = require('url');

const http2Promise = require('@_local/collector/test/test_util/http2Promise');

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = require('http2').constants;

const port = require('@_local/collector/test/test_util/app-port')();
const downstreamPort = process.env.DOWNSTREAM_PORT;

const logPrefix = `Spec Compliance Test App (${useHttp2 ? 'HTTP2' : 'HTTP1'}) (${process.pid}):\t`;

if (useHttp2) {
  // HTTP 2

  const http2 = require('http2');

  const sslDir = path.join(path.dirname(require.resolve('@_local/collector/package.json')), 'test', 'apps', 'ssl');

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

async function handleRequest(incomingHeaders, method, url, resOrStream) {
  const loggedHeaders = Object.assign({}, incomingHeaders);
  delete loggedHeaders.host;
  delete loggedHeaders.accept;
  delete loggedHeaders.connection;

  if (process.env.WITH_STDOUT) {
    log(`-> ${method} ${url} ${JSON.stringify(loggedHeaders)}`);
  }

  const { pathname, query } = parse(url, true);

  if (pathname === '/') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }
    return endWithStatus(method, url, resOrStream, 200);
  } else if (pathname === '/start') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }

    if (useNativeFetch) {
      return executeDownstreamRequestViaNativeFetch(method, url, query, resOrStream);
    } else {
      return executeDownstreamRequestViaCoreHttp(method, url, query, resOrStream);
    }
  }

  return endWithStatus(method, url, resOrStream, 404);
}

async function executeDownstreamRequestViaCoreHttp(method, url, query, resOrStream) {
  const requestOptions = {
    method,
    qs: query,
    headers: {
      'X-Request-Header-App-To-Downstream': 'Value 2'
    }
  };
  let request;
  if (useHttp2) {
    requestOptions.baseUrl = `https://localhost:${downstreamPort}`;
    requestOptions.path = '/downstream';
    request = http2Promise.request(requestOptions);
  } else {
    requestOptions.uri = `http://localhost:${downstreamPort}/downstream`;
    request = fetch(requestOptions.uri, requestOptions)
      .then(result => {
        const contentType = result.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return result.json();
        } else {
          return result.text();
        }
      })
      .then(request1 => {
        return request1;
      });
  }
  try {
    const downstreamResponse = await request;
    return endWithPayload(method, url, resOrStream, downstreamResponse);
  } catch (e) {
    return endWithError(method, url, resOrStream, e);
  }
}

async function executeDownstreamRequestViaNativeFetch(method, url, query, resOrStream) {
  try {
    let fullUrl = `http://localhost:${downstreamPort}/downstream`;
    if (Object.keys(query).length > 0) {
      const urlSearchParams = new URLSearchParams(query);
      fullUrl = `${fullUrl}?${urlSearchParams}`;
    }
    const downstreamResponse = await fetch(fullUrl, {
      method,
      headers: {
        'X-Request-Header-App-To-Downstream': 'Value 2'
      }
    });
    const downstreamResponsePayload = await downstreamResponse.json();
    return endWithPayload(method, url, resOrStream, downstreamResponsePayload);
  } catch (e) {
    return endWithError(method, url, resOrStream, e);
  }
}

function endWithPayload(method, url, resOrStream, payload) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> 200`);
  }
  if (typeof payload === 'object') {
    payload = JSON.stringify(payload);
  }
  if (useHttp2) {
    resOrStream.respond({
      [HTTP2_HEADER_STATUS]: 200,
      'X-Response-Header-App-To-Test': 'Value 4'
    });
  } else {
    resOrStream.statusCode = 200;
    resOrStream.setHeader('X-Response-Header-App-To-Test', 'Value 4');
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

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
