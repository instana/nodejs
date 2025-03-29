/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/load_express_v4');

const fetch = require('node-fetch-v2');

require('../../../..')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});
const express = require('express');
const port = require('../../../test_util/app-port')();

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
  const url = `${requestOptions.uri}${requestOptions.query ? `?${new URLSearchParams(requestOptions.query)}` : ''}`;
  const response = await fetch(url, {
    method: requestOptions.method
  });
  if (response.ok) {
    return {
      statusCode: response.status
    };
  } else {
    throw response;
  }
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express Async Await App (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
