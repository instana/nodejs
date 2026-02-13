/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../..');

const delay = require('@_local/core/test/test_util/delay');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;
const response = {};

const handler = async event => {
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

  if (process.env.DETACHED_REQUEST) {
    setTimeout(async () => {
      await fetch(downstreamDummyUrl, { headers: { 'X-Downstream-Header': 'yes' } });
    }, 1000);
  }

  await fetch(downstreamDummyUrl, { headers: { 'X-Downstream-Header': 'yes' } });
  if (process.env.HANDLER_DELAY) {
    console.log(`Introducing an artificial delay in the handler of ${process.env.HANDLER_DELAY} ms.`);
    await delay(parseInt(process.env.HANDLER_DELAY, 10));
  }

  if (event.error === 'asynchronous') {
    const error = new Error('Boom!');
    // deliberately setting error.message to a non-string value to test this case
    error.message = { content: 'Boom!' };
    throw error;
  } else {
    if (event.requestedStatusCode) {
      response.statusCode = parseInt(event.requestedStatusCode, 10);
    }
    return response;
  }
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
