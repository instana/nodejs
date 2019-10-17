'use strict';

// eslint-disable-next-line import/no-unresolved
const instana = require('@instana/serverless');
const fetch = require('node-fetch');

exports.handler = instana.awsLambda.wrap(async event => {
  console.log('in actual handler');
  await fetch('https://example.com');
  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
      message: 'Stan says hi!'
    };
  }
});
