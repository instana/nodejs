/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

require('@instana/core/test/test_util/load_express_v4');

require('../../../..')();

const fetch = require('node-fetch-v2');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();
const bunyan = require('bunyan');
const bunyanLogger = bunyan.createLogger({ name: 'test-logger-console' });

const app = express();
const logPrefix = `Console App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/log', (req, res) => {
  console.log('console.log - should not be traced');
  finish(res);
});

app.get('/info', (req, res) => {
  console.info('console.info - should not be traced');
  finish(res);
});

app.get('/debug', (req, res) => {
  console.debug('console.debug - should not be traced');
  finish(res);
});

app.get('/warn', (req, res) => {
  console.warn('console.warn - should be traced');
  finish(res);
});

app.get('/error', (req, res) => {
  console.error('console.error - should be traced');
  finish(res);
});

app.get('/timeout', (req, res) => {
  setTimeout(() => {
    console.error('console.error - should be traced');
    finish(res);
  }, 100);
});

app.get('/exit-span', (req, res) => {
  fetch('http://127.0.0.1:65212').catch(err => {
    console.error(err, 'console.error - should be traced');
    finish(res);
  });
});

app.get('/3rd-party-logger', (req, res) => {
  bunyanLogger.error('This is a test');
  finish(res);
});

app.get('/error-object', (req, res) => {
  console.error(new Error('console.error - should be traced'));

  finish(res);
});

app.get('/random-object', (req, res) => {
  console.error({ foo: { bar: 'baz' } });

  finish(res);
});

app.get('/random-object-with-extra-string-field', (req, res) => {
  console.error({ foo: { bar: 'baz' } }, 'console.error - should be traced');

  finish(res);
});

app.get('/nested-error-object-and-extra-string-field', (req, res) => {
  console.error({ foo: 'bar', err: new Error('This is a nested error.') }, 'console.error - should be traced');

  finish(res);
});

app.get('/error-object-and-extra-string-field', (req, res) => {
  console.error(new Error('This is an error.'), 'console.error - should be traced');

  finish(res);
});

function finish(res) {
  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
}

app.listen(port, () => {
  console.log(`Listening on port: ${port}`);
});
