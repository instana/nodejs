/* eslint-disable */

const rp = require('request-promise');
const request = require('request');

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const express = require('express');
const semver = require('semver');
const app = express();

app.get('/', (req, res) => res.sendStatus(200));

// simulating async middleware
app.use((req, res, next) => setTimeout(() => next(), 50));

const asyncHandler = fn => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

app.get(
  '/getSomething',
  asyncHandler(async (req, res) => {
    try {
      const statusCode = await executeCallSequence();
      res.sendStatus(statusCode);
    } catch (err) {
      log('Failed to get data', err);
      res.sendStatus(500);
    }
  })
);

async function executeCallSequence() {
  const { statusCode } = await sendRequest({
    method: 'GET',
    uri: 'http://127.0.0.1:' + process.env.UPSTREAM_PORT + '/foo'
  });

  const { statusCode: statusCode2 } = await sendRequest({
    method: 'GET',
    uri: 'http://127.0.0.1:' + process.env.UPSTREAM_PORT + '/bar',
    query: {
      foo: statusCode
    }
  });

  return statusCode2;
}

async function sendRequest(requestOptions) {
  if (process.env.USE_REQUEST_PROMISE === 'true') {
    const response = await rp({
      ...requestOptions,
      simple: true,
      resolveWithFullResponse: true
    });
    return response;
  }

  // a custom wrapper around request. Yes, this exists out of the box for request, but this
  // is supposed to be a repro case for a customer issue.
  const response = await new Promise((resolve, reject) => {
    request(requestOptions, (error, response, body) => {
      if (error) {
        reject(error);
      } else {
        if (response.statusCode >= 200 && response.statusCode <= 299) {
          resolve(response);
        } else {
          reject(response);
        }
      }
    });
  });
  return response;
}

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = 'Express Async Await App (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
