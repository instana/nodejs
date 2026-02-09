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

require('@instana/collector')();

const fs = require('fs');
const http2 = require('http2');
const path = require('path');

const { HTTP2_HEADER_STATUS } = http2.constants;

const router = require('@_local/collector/test/test_util/simpleHttp2Router');

const logPrefix = `HTTP2: Server (${process.pid}):\t`;
const port = require('@_local/collector/test/test_util/app-port')();

const server = http2.createSecureServer({
  key: fs.readFileSync(require.resolve('@_local/collector/test/apps/ssl/key')),
  cert: fs.readFileSync(require.resolve('@_local/collector/test/apps/ssl/cert'))
});

server.on('error', err => {
  log('HTTP2 server error', err);
});

const routes = {
  '/': {
    GET: stream => {
      stream.respond({
        [HTTP2_HEADER_STATUS]: 204
      });
      stream.end();
    }
  },
  '/request': {
    GET: (stream, query) => respond(stream, query),
    POST: (stream, query) => respond(stream, query),
    PUT: (stream, query) => respond(stream, query),
    PATCH: (stream, query) => respond(stream, query),
    DELETE: (stream, query) => respond(stream, query)
  },
  '/inject-trace-id': {
    GET: respondWithTraceId
  }
};

function respond(stream, query) {
  const responseHeaders = {
    'content-type': 'application/json; charset=UTF-8',
    'X-My-ReSpoNse-HeadeR': 'x-my-response-header-value'
  };
  if (query['server-timing-string']) {
    responseHeaders['sErver-tiMING'] = 'myServerTimingKey';
  } else if (query['server-timing-array']) {
    responseHeaders['sErver-tiMING'] = ['key1', 'key2;dur=42'];
  } else if (query['server-timing-string-with-intid']) {
    responseHeaders['sErver-tiMING'] = 'myServerTimingKey, intid;desc=1234567890abcdef';
  } else if (query['server-timing-array-with-intid']) {
    responseHeaders['sErver-tiMING'] = ['key1', 'key2;dur=42', 'intid;desc=1234567890abcdef'];
  }

  if (query.error) {
    responseHeaders[HTTP2_HEADER_STATUS] = 500;
    stream.respond(responseHeaders);
    stream.end(
      JSON.stringify({
        message: 'Oops!'
      })
    );
  } else {
    responseHeaders[HTTP2_HEADER_STATUS] = 200;
    stream.respond(responseHeaders);
    stream.end(
      JSON.stringify({
        message: 'Ohai HTTP2!'
      })
    );
  }
}

function respondWithTraceId(stream, query, headers) {
  stream.respond({ [HTTP2_HEADER_STATUS]: 200 });
  stream.end(`Instana Trace ID: ${headers['x-instana-t']}`);
}

server.on('stream', (stream, headers) => {
  router(routes, stream, headers);
});

server.listen(port, () => {
  log(`Listening (HTTP2) on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
