/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../../..');

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
