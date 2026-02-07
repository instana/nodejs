/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const fs = require('fs');
const path = require('path');

const readSymbolProperty = require('@_instana/core/src/util/readSymbolProperty');
const streamSymbol = 'Symbol(stream)';

const logPrefix = `HTTP: Server (${process.pid}):\t`;
const port = require('@_instana/collector/test/test_util/app-port')();

if (process.env.APP_USES_HTTP2 === 'true' && process.env.APP_USES_HTTPS === 'false') {
  throw new Error('Using the HTTP2 compat API without HTTPS is not supported by this test app.');
}

let server;
if (process.env.APP_USES_HTTPS === 'true') {
  const sslDir = path.join(path.dirname(require.resolve('@_instana/collector/package.json')), 'test', 'apps', 'ssl');
  const createServer =
    process.env.APP_USES_HTTP2 === 'true' ? require('http2').createSecureServer : require('https').createServer;
  server = createServer({
    key: fs.readFileSync(path.join(sslDir, 'key')),
    cert: fs.readFileSync(path.join(sslDir, 'cert'))
  }).listen(port, () => {
    log(`Listening on port ${port} (TLS: true, HTTP2: ${process.env.APP_USES_HTTP2}).`);
  });
} else {
  server = require('http')
    .createServer()
    .listen(port, () => {
      log(`Listening on port ${port} (TLS: false, HTTP2: false).`);
    });
}

server.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams);

  let body = null;

  if (req.url === '/dont-respond') {
    // Deliberately not sending a response in time so that the request times out client side. This will lead to the
    // following events to be emitted (in that order):
    // - req#aborted
    // - res#close
    setTimeout(() => {
      res.end();
    }, 4000);
    return;
  } else if (req.url === '/destroy-socket') {
    // Deliberately destroying the connection (that is, the underlying socket) server side. This will lead to the
    // following events to be emitted (in that order):
    // - req#aborted
    // - res#close
    req.destroy();
    const underlyingStream = readSymbolProperty(req, streamSymbol);
    if (underlyingStream && !underlyingStream.destroyed) {
      // According to https://nodejs.org/api/http2.html#http2_request_destroy_error the req.destroy() call should also
      // destroy the underlying HTTP 2 stream (if this is HTTP 2 in compat mode) but apparently it does not, so we do it
      // explicitly.
      underlyingStream.destroy();
    }
    return;
  } else if (req.url === '/inject-instana-trace-id') {
    body = `Instana Trace ID: ${req.headers['x-instana-t']}`;
  }

  if (query.responseStatus) {
    res.statusCode = parseInt(query.responseStatus || 200, 10);
  }
  if (query.responseHeader) {
    res.setHeader('X-MY-ENTRY-RESPONSE-HEADER', 'Response Header Value');
    res.setHeader('x-my-entry-response-multi-header', ['value1', 'value2']);
    res.setHeader('x-my-entry-response-not-captured--header', 'nope');
  }
  if (query.cookie) {
    res.setHeader('sEt-CooKie', query.cookie);
  }
  if (query['server-timing-string']) {
    res.setHeader('sErver-tiMING', 'myServerTimingKey');
  } else if (query['server-timing-array']) {
    res.setHeader('sErver-tiMING', ['key1', 'key2;dur=42']);
  } else if (query['server-timing-string-with-intid']) {
    res.setHeader('sErver-tiMING', 'myServerTimingKey, intid;desc=1234567890abcdef');
  } else if (query['server-timing-array-with-intid']) {
    res.setHeader('sErver-tiMING', ['key1', 'key2;dur=42', 'intid;desc=1234567890abcdef']);
  }

  const delay = parseInt(query.delay || 0, 10);

  if (delay === 0) {
    endResponse(query, res, body);
  } else {
    setTimeout(() => {
      endResponse(query, res, body);
    }, delay);
  }
});

function endResponse(query, res, body) {
  if (query.writeHead) {
    res.writeHead(200, {
      'content-type': 'text/plain',
      'X-WRITE-HEAD-RESPONSE-HEADER': 'Write Head Response Header Value',
      'x-write-head-response-multi-header': ['value1', 'value2'],
      'x-write-head-response-not-captured-header': "just don't"
    });
  }

  // Regularly ending the response will emit the following events:
  // - res#finish
  // - res#close
  res.end(body);
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
