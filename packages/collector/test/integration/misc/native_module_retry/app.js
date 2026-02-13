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

require('@instana/collector')({
  level: 'debug'
});

const http = require('http');

const port = require(process.env.APP_PORT_MODULE)();

const requestHandler = (request, response) => {
  if (request.url === '/') {
    return success(response);
  } else {
    response.statusCode = 404;
    return response.end('Not here :-(');
  }
};

function success(response) {
  setTimeout(() => {
    response.end("Everything's peachy.");
  }, 100);
}

const server = http.createServer(requestHandler);

server.listen(port, err => {
  if (err) {
    // eslint-disable-next-line no-console
    return console.log('something bad happened', err);
  }

  // eslint-disable-next-line no-console
  console.log(`server is listening on ${port}`);
});
