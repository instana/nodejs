/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

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
const response = {};

// This Lambda uses a deprecated Lambda API from 2016 that still exists (and, unfortunately, is used by some customers)
// but isn't even documented anymore. See
// eslint-disable-next-line max-len
// https://web.archive.org/web/20161216092320/https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-using-old-runtime.html
const handler = function handler(event, context) {
  console.log('in actual handler');

  if (event.version === '1.0') {
    response.headers = {
      'X-Response-Header-1': 'response header value 1',
      'X-Response-Header-3': 'response header value 3'
    };

    response.multiValueHeaders = {
      'X-Response-Header-2': ['response', 'header', 'value 2'],
      'X-Response-Header-4': ['response', 'header', 'value 4']
    };
  } else {
    response.headers = {
      'X-Response-Header-1': 'response header value 1, response header value 2',
      'X-Response-Header-2': 'response header value 2',
      'X-Response-Header-3': 'should not capture'
    };
  }

  if (process.env.SERVER_TIMING_HEADER) {
    if (process.env.SERVER_TIMING_HEADER === 'array') {
      if (event.version === '1.0') {
        response.multiValueHeaders['ServEr-TiminG'] = ['cache;desc="Cache Read";dur=23.2', 'cpu;dur=2.4'];
      } else {
        response.headers['ServEr-TiminG'] = 'cache;desc="Cache Read";dur=23.2,cpu;dur=2.4';
      }
    } else {
      response.headers['sErveR-tIming'] = 'cache;desc="Cache Read";dur=23.2';
    }
  }

  response.body = {
    message: 'Stan says hi!'
  };

  if (event.error === 'synchronous') {
    throw new Error('Boom!');
  }

  const downstream = new URL(downstreamDummyUrl);
  const req = http.request(
    {
      host: downstream.hostname,
      port: downstream.port,
      path: downstream.path,
      method: 'GET',
      headers: { 'X-Downstream-Header': 'yes' }
    },
    res => {
      res.resume();
      res.on('end', () => {
        let delayCallback;
        if (process.env.HANDLER_DELAY) {
          console.log(`Introducing an artificial delay in the handler of ${process.env.HANDLER_DELAY} ms.`);
          delayCallback = cb => setTimeout(cb, parseInt(process.env.HANDLER_DELAY, 10));
        } else {
          delayCallback = cb => setImmediate(cb);
        }

        delayCallback(() => {
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
    }
  );
  req.on('error', e => {
    context.fail(e);
  });
  req.end();
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
