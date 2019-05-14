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

const wrapper = process.env.USE_STYLE_DETECTION ? instana.awsLambda.wrap : instana.awsLambda.wrapPromise;

exports.handler = wrapper.apply(instana.awsLambda, args);
