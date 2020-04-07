/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../..');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

const http = require('http');

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

const response = {
  headers: {
    'x-custom-header': 'custom header value'
  },
  body: {
    message: 'Stan says hi!'
  }
};

if (process.env.SERVER_TIMING_HEADER) {
  if (process.env.SERVER_TIMING_HEADER === 'string') {
    response.headers['sErveR-tIming'] = 'cache;desc="Cache Read";dur=23.2';
  } else if (process.env.SERVER_TIMING_HEADER === 'array') {
    response.multiValueHeaders = {
      'ServEr-TiminG': ['cache;desc="Cache Read";dur=23.2', 'cpu;dur=2.4']
    };
  } else {
    throw new Error(`Unknown SERVER_TIMING_HEADER value: ${process.env.SERVER_TIMING_HEADER}.`);
  }
}

// This Lambda uses a deprecated Lambda API from 2016 that still exists (and, unfortunately, is used by some customers)
// but isn't even documented anymore. See
// eslint-disable-next-line max-len
// https://web.archive.org/web/20161216092320/https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-using-old-runtime.html
const handler = function handler(event, context) {
  console.log('in actual handler');
  if (event.error === 'synchronous') {
    throw new Error('Boom!');
  }
  const req = http.get(downstreamDummyUrl, res => {
    res.resume();
    res.on('end', () => {
      if (event.error === 'asynchronous') {
        const error = new Error('Boom!');
        if (Math.random() > 0.5) {
          context.fail(error);
        } else {
          context.done(error);
        }
      } else {
        if (event.requestedStatusCode) {
          response.statusCode = parseInt(event.requestedStatusCode, 10);
        }
        if (Math.random() > 0.5) {
          context.succeed(response);
        } else {
          context.done(null, response);
        }
      }
    });
  });
  req.on('error', e => {
    context.fail(e);
  });
};

const args = process.env.WITH_CONFIG
  ? [
      {
        tracing: {
          stackTraceLength: 2
        }
      },
      handler
    ]
  : [handler];

exports.handler = instana.wrap.apply(instana, args);
