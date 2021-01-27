/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// Deliberately not using Express.js here to avoid conflicts with Express.js' error handling.

const instana = require('../../..');
const config = {
  // Overriding the default setting of INSTANA_FORCE_TRANSMISSION_STARTING_AT=1 that we usually use for all other
  // tests. This is done to verify that the uncaught exception handler actually transmits the erroneous span before
  // terminating the process.
  tracing: {
    forceTransmissionStartingAt: 500
  }
};
if (process.env.ENABLE_REPORT_UNCAUGHT_EXCEPTION) {
  config.reportUncaughtException = true;
}
if (process.env.ENABLE_REPORT_UNHANDLED_REJECTIONS) {
  config.reportUnhandledPromiseRejections = true;
}

instana(config);

const http = require('http');
const port = process.env.APP_PORT;

const requestHandler = (request, response) => {
  if (request.url === '/') {
    return success(response);
  } else if (request.url === '/other') {
    return success(response);
  } else if (request.url === '/boom') {
    return uncaughtError(response);
  } else if (request.url === '/reject') {
    return uncaughtPromiseRejection(response);
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
  process.nextTick(() => {
    throw new Error('Boom');
  });
}

function uncaughtPromiseRejection(response) {
  process.nextTick(() => {
    Promise.reject(new Error('Unhandled Promise Rejection'));
    process.nextTick(() => {
      response.end('Rejected.');
    });
  });
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
