'use strict';

const fetch = require('node-fetch');

const instana = require('../../..');

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
