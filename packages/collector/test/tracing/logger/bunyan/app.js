/* eslint-disable no-console */

'use strict';

const agentPort = process.env.AGENT_PORT;

const instana = require('../../../..');
instana({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

const request = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const bunyan = require('bunyan');
const logger = bunyan.createLogger({ name: 'test-logger' });

const app = express();
const logPrefix = `Express / Bunyan App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/info', (req, res) => {
  logger.info('Info message - must not be traced.');
  finish(res);
});

app.get('/warn', (req, res) => {
  logger.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/error', (req, res) => {
  logger.error('Error message - should be traced.');
  finish(res);
});

app.get('/fatal', (req, res) => {
  logger.fatal('Fatal message - should be traced.');
  finish(res);
});

app.get('/error-object-only', (req, res) => {
  logger.error(new Error('This is an error.'));
  finish(res);
});

app.get('/nested-error-object-only', (req, res) => {
  logger.error({ foo: 'bar', err: new Error('This is a nested error.') });
  finish(res);
});

app.get('/error-random-object-only', (req, res) => {
  logger.error({ foo: { bar: 'baz' } });
  finish(res);
});

app.get('/error-object-and-string', (req, res) => {
  logger.error(new Error('This is an error.'), 'Error message - should be traced.');
  finish(res);
});

app.get('/nested-error-object-and-string', (req, res) => {
  logger.error({ foo: 'bar', err: new Error('This is a nested error.') }, 'Error message - should be traced.');
  finish(res);
});

app.get('/error-random-object-and-string', (req, res) => {
  logger.error({ foo: { bar: 'baz' } }, 'Error message - should be traced.');
  finish(res);
});

app.get('/child-error', (req, res) => {
  const child = logger.child({ a: 'property' });
  child.error('Child logger error message - should be traced.');
  finish(res);
});

function finish(res) {
  request(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
}

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
