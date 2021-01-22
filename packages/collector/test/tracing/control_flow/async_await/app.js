/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2017
 */

'use strict';

const rp = require('request-promise');
const request = require('request');

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const express = require('express');

const asyncRoute = require('../../../test_util/asyncExpressRoute');

const app = express();

app.get('/', (req, res) => res.sendStatus(200));

// simulating async middleware
app.use((req, res, next) => setTimeout(() => next(), 50));

app.get(
  '/getSomething',
  asyncRoute(async (req, res) => {
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
    uri: `http://127.0.0.1:${process.env.UPSTREAM_PORT}/foo`
  });

  const { statusCode: statusCode2 } = await sendRequest({
    method: 'GET',
    uri: `http://127.0.0.1:${process.env.UPSTREAM_PORT}/bar`,
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
    request(requestOptions, (error, res) => {
      if (error) {
        reject(error);
      } else if (res.statusCode >= 200 && res.statusCode <= 299) {
        resolve(res);
      } else {
        reject(res);
      }
    });
  });
  return response;
}

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express Async Await App (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
