'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const instana = require('@instana/aws-lambda'); // provided by Lambda layer "instana"

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
