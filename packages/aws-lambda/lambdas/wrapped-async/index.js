'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const instana = require('@instana/aws-lambda'); // provided by Lambda layer "instana"

exports.handler = instana.wrap(async event => {
  console.log('in actual handler');
  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
      message: 'Stan says hi!'
    };
  }
});
