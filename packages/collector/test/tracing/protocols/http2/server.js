'use strict';

require('../../../../')();

const fs = require('fs');
const http2 = require('http2');
const path = require('path');

const { HTTP2_HEADER_STATUS } = http2.constants;

const router = require('../../../test_util/simpleHttp2Router');

const logPrefix = `HTTP2: Server (${process.pid}):\t`;
const port = process.env.APP_PORT || 3217;
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
  '/request': {
    GET: (stream, query) => respond(stream, query),
    POST: (stream, query) => respond(stream, query),
    PUT: (stream, query) => respond(stream, query),
    PATCH: (stream, query) => respond(stream, query),
    DELETE: (stream, query) => respond(stream, query)
  }
};

function respond(stream, query) {
  if (query.error) {
    stream.respond({
      'content-type': 'application/json; charset=UTF-8',
      [HTTP2_HEADER_STATUS]: 500,
      'X-My-ReSpoNse-HeadeR': 'x-my-response-header-value'
    });
    stream.end(
      JSON.stringify({
        message: 'Oops!'
      })
    );
  } else {
    stream.respond({
      'content-type': 'application/json; charset=UTF-8',
      [HTTP2_HEADER_STATUS]: 200,
      'X-My-ReSpoNse-HeadeR': 'x-my-response-header-value'
    });
    stream.end(
      JSON.stringify({
        message: 'Ohai HTTP2!'
      })
    );
  }
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
