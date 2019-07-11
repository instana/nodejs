/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../../..');

const fetch = require('node-fetch');

const config = require('../../config');

const handler = async event => {
  console.log('in actual handler');
  await fetch(config.downstreamDummyUrl);
  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
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
