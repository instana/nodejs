/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../..');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/aws_lambda/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

const fetch = require('node-fetch');

const config = require('../../../serverless/test/config');

const handler = async event => {
  console.log('in actual handler');
  await fetch(config.downstreamDummyUrl);
  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
      statusCode: event.requestedStatusCode ? parseInt(event.requestedStatusCode, 10) : undefined,
      message: 'Stan says hi!'
    };
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

exports.handler = instana.awsLambda.wrap.apply(instana.awsLambda, args);
