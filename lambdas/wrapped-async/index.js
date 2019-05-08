'use strict';

const instana = require('@instana/serverless');
const fetch = require('node-fetch');

exports.handler = instana.awsLambda.wrap(async (event, context) => {
  console.log('in actual handler');
  const response = await fetch('https://example.com');
  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
      message: 'Stan says hi!'
    };
  }
});
