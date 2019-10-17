/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../../..');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/aws_lambda/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../../src/aws_lambda/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..', '..');

const fetch = require('node-fetch');

const config = require('../../config');

const handler = event => {
  console.log('in actual handler');
  return fetch(config.downstreamDummyUrl).then(() => {
    if (event.error) {
      throw new Error('Boom!');
    }
    return {
      // In contrast to both other lambdas we pass back the HTTP status code as a string here, just so this case is also
      // tested.
      statusCode: event.requestedStatusCode ? event.requestedStatusCode : undefined,
      message: 'Stan says hi!'
    };
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

exports.handler = instana.awsLambda.wrap.apply(instana.awsLambda, args);
