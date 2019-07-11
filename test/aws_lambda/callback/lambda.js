/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../../..');

const http = require('http');

const config = require('../../config');

const handler = function handler(event, context, callback) {
  console.log('in actual handler');
  const req = http.get(config.downstreamDummyUrl, res => {
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
