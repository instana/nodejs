/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

require('../../../../')();

const fs = require('fs');
const http2 = require('http2');
const path = require('path');

const http2Promise = require('../../../test_util/http2Promise');
const router = require('../../../test_util/simpleHttp2Router');

const { HTTP2_HEADER_STATUS } = http2.constants;

const logPrefix = `HTTP2: Client (${process.pid}):\t`;
const port = process.env.APP_PORT || 3216;
const downstreamPort = process.env.SERVER_PORT || 3217;
const sslDir = path.join(__dirname, '..', '..', '..', 'apps', 'ssl');

const server = http2.createSecureServer({
  key: fs.readFileSync(path.join(sslDir, 'key')),
  cert: fs.readFileSync(path.join(sslDir, 'cert'))
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
  '/trigger-downstream': {
    GET: (stream, query) => triggerDownstream('GET', stream, query),
    POST: (stream, query) => triggerDownstream('POST', stream, query),
    PUT: (stream, query) => triggerDownstream('PUT', stream, query),
    PATCH: (stream, query) => triggerDownstream('PATCH', stream, query),
    DELETE: (stream, query) => triggerDownstream('DELETE', stream, query)
  }
};

function triggerDownstream(method, stream, query) {
  const downStreamQuery = {};
  if (query.error) {
    downStreamQuery.error = 'true';
  }
  if (query.withQuery) {
    downStreamQuery.q1 = 'some';
    downStreamQuery.q2 = 'value';
    downStreamQuery.rEmoVeThis = 'classified';
  }
  let downStreamQueryString = Object.keys(downStreamQuery)
    .map(k => `${k}=${downStreamQuery[k]}`)
    .join('&');
  if (downStreamQueryString.length > 0) {
    downStreamQueryString = `?${downStreamQueryString}`;
  }

  http2Promise
    .request({
      method,
      baseUrl: `https://localhost:${downstreamPort}`,
      path: `/request${downStreamQueryString}`,
      headers: { 'X-My-ReQueSt-HeaDer': 'x-my-request-header-value' },
      simple: false
    })
    .then(response => {
      stream.respond({
        ...response.headers
      });
      stream.end(response.body);
    })
    .catch(err => {
      log('HTTP2 client error', err);
      stream.respond({
        [HTTP2_HEADER_STATUS]: 502
      });
      stream.end();
    });
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
