'use strict';

const instana = require('../../');
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
  level: 'debug',
  reportUncaughtException: true
});

const http = require('http');
const port = process.env.APP_PORT;

const requestHandler = (request, response) => {
  if (request.url === '/') {
    return success(response);
  } else if (request.url === '/boom') {
    return uncaughtError(response);
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

function uncaughtError() {
  setTimeout(() => {
    throw new Error('Boom');
  }, 5000); // give the native module addon retry mechanism enough time to load netlinkwrapper
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
