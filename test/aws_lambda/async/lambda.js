'use strict';

const instana = require('../../..');

const fetch = require('node-fetch');

const config = require('../../config');

const handler = async (event, context) => {
  console.log('in actual handler');
  const response = await fetch(config.downstreamDummyUrl);
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

const wrapper = process.env.USE_STYLE_DETECTION ? instana.awsLambda.wrap : instana.awsLambda.wrapAsync;

exports.handler = wrapper.apply(instana.awsLambda, args);
