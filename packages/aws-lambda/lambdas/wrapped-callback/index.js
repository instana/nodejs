'use strict';

const instana = require('@instana/serverless');
const https = require('https');

exports.handler = instana.awsLambda.wrap((event, context, callback) => {
  console.log('in actual handler');
  const req = https.get('https://example.com', res => {
    res.resume();
    res.on('end', () => {
      if (event.error) {
        callback(new Error('Boom!'));
      } else {
        callback(null, {
          message: 'Stan says hi!'
        });
      }
    });
  });
  req.on('error', e => {
    callback(e);
  });
});
