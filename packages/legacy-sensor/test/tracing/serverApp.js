/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const app = express();
const logPrefix = `Express HTTP client: Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.set('Foobar', '42');
  res.sendStatus(200);
});

[
  '/request-url-opts',
  '/request-only-url',
  '/request-only-opts',
  '/get-url-opts',
  '/get-only-url',
  '/get-only-opts'
].forEach(p => {
  app.get(p, (req, res) => {
    res.sendStatus(200);
  });
});

app.get('/timeout', (req, res) => {
  setTimeout(() => {
    res.sendStatus(200);
  }, 10000);
});

app.put('/continue', (req, res) => {
  // Node http server will automatically send 100 Continue when it receives a request with an "Expect: 100-continue"
  // header present, unless we override the 'checkContinue' listener. For our test case, the default behaviour is just
  // fine.
  res.json({ response: 'yada yada yada' });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
