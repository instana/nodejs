'use strict';

const fetch = require('node-fetch');

const instana = require('../../..');

exports.handler = instana.awsLambda.wrap((event, context) => {
  console.log('in actual handler');
  return fetch('https://example.com').then(() => {
    if (event.error) {
      throw new Error('Boom!');
    }
    return {
      message: 'Stan says hi!'
    };
  });
});
