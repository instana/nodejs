/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

const instanaConfig = {
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: true,
    forceTransmissionStartingAt: 1,
    stackTraceLength: process.env.STACK_TRACE_LENGTH_TEST != null ? process.env.STACK_TRACE_LENGTH_TEST : 10
  }
};

require('../../../../..')(instanaConfig);
const express = require('express');
const http = require('http');
const port = require('../../../../test_util/app-port')();
const app = express();

app.get('/', (req, res) => {
  res.sendStatus(200);
});

// eslint-disable-next-line no-unused-vars
app.get('/trigger-error', (req, res) => {
  // This endpoint makes an HTTP client call that will fail
  // This will trigger setErrorDetails on the http.client span
  fetch('http://localhost:1/non-existent-endpoint', {
    method: 'GET',
    timeout: 100
  })
    .then(response => {
      res.sendStatus(response.status);
    })
    .catch(err => {
      res.status(500).send(err);
    });
});

// eslint-disable-next-line no-unused-vars
app.get('/trigger-error-no-stack', (req, res) => {
  const options = {
    hostname: 'localhost',
    port: process.env.UPSTREAM_PORT,
    path: '/return-error',
    method: 'GET'
  };

  const clientRequest = http.request(options, response => {
    response.on('data', () => {});
    response.on('end', () => {});
  });

  setImmediate(() => {
    const errorWithoutStack = {
      message: 'Error without stack',
      code: 'NO_STACK_ERROR',
      name: 'CustomError'
    };

    clientRequest.emit('error', errorWithoutStack);
    res.status(500).send(errorWithoutStack);
  });

  clientRequest.end();
});

app.use((req, res) => {
  log(req.method, req.url);
  const delay = parseInt(req.query.delay || 0, 10);
  setTimeout(() => {
    let url;
    if (req.query.url && req.query.url !== 'undefined') {
      url = req.query.url;
    } else {
      url = `http://localhost:${process.env.UPSTREAM_PORT}/proxy-call${req.url}`;
    }

    fetch(url, {
      method: req.method,
      timeout: 500
    })
      .then(response => {
        res.sendStatus(response.status);
      })
      .catch(err => {
        res.sendStatus(500);
        log('Unexpected error', err);
      });
  }, delay * 0.25);
});

app.listen(port, () => {
  log(`Listening on port: ${process.env.APP_PORT}, proxying to ${process.env.UPSTREAM_PORT}.`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express Proxy (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
