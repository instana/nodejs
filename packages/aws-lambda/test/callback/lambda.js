/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../..');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

const http = require('http');

const config = require('../../../serverless/test/config');

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

const handler = function handler(event, context, callback) {
  console.log('in actual handler');
  const req = http.get(config.downstreamDummyUrl, res => {
    res.resume();
    res.on('end', () => {
      if (event.error) {
        callback(new Error('Boom!'));
      } else {
        if (event.requestedStatusCode) {
          response.statusCode = parseInt(event.requestedStatusCode, 10);
        }
        callback(null, response);
      }
    });
  });
  req.on('error', e => {
    callback(e);
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
