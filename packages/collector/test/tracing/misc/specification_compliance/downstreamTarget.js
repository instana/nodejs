/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const useHttp2 = process.env.APP_USES_HTTP2 ? process.env.APP_USES_HTTP2 === 'true' : false;

const fs = require('fs');
const path = require('path');

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = require('http2').constants;

const port = require('../../../test_util/app-port')();

const logPrefix = `Spec Compliance Test Downstream Target (${useHttp2 ? 'HTTP2' : 'HTTP1'}) (${process.pid}):\t`;

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
  return endWithPayload(method, url, resOrStream, loggedHeaders);
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
      'X-Response-Header-Downstream-To-App': 'Value 3'
    });
  } else {
    resOrStream.setHeader('X-Response-Header-Downstream-To-App', 'Value 3');
    resOrStream.statusCode = 200;
  }
  resOrStream.end(payload);
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
