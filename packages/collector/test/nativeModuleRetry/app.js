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

const instana = require('../..');
// In prodction, @instana/shared-metrics is in a path like node_modules/@instana/shared-metrics and nativeModuleRetry
// relies on that structure. In this test scenario, it is in packages/shared-metrics and we need to work around this.
instana.sharedMetrics.util.nativeModuleRetry.selfNodeModulesPath = require('path').join(
  __dirname,
  '..',
  '..',
  '..',
  'shared-metrics',
  'node_modules'
);
instana({
  level: 'debug'
});

const http = require('http');
const port = require('../test_util/app-port')();

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
