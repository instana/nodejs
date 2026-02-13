/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// Deliberately not using Express.js here to avoid conflicts with Express.js' error handling.

const instana = require('@instana/collector');
const config = {
  // Overriding the default setting of INSTANA_FORCE_TRANSMISSION_STARTING_AT=1 that we usually use for all other
  // tests. This is done to verify that the uncaught exception handler actually transmits the erroneous span before
  // terminating the process.
  tracing: {
    forceTransmissionStartingAt: 500
  }
};

if (process.env.ENABLE_REPORT_UNHANDLED_REJECTIONS) {
  config.reportUnhandledPromiseRejections = true;
}

instana(config);

const http = require('http');
const port = require('@_local/collector/test/test_util/app-port')();

const requestHandler = (request, response) => {
  if (request.url === '/') {
    return success(response);
  } else if (request.url === '/reject-with-error-reason') {
    return uncaughtPromiseRejection(response, 'error');
  } else if (request.url === '/reject-with-string-reason') {
    return uncaughtPromiseRejection(response, 'string');
  } else if (request.url === '/reject-with-null-reason') {
    return uncaughtPromiseRejection(response, 'none');
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

function uncaughtPromiseRejection(response, reasonType) {
  process.nextTick(() => {
    if (reasonType === 'none') {
      Promise.reject();
    } else if (reasonType === 'string') {
      // eslint-disable-next-line prefer-promise-reject-errors
      Promise.reject('rejecting a promise with a string value');
    } else {
      Promise.reject(new Error('Unhandled Promise Rejection'));
    }
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
