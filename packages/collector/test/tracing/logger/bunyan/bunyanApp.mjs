/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import fetch from 'node-fetch-v2';
import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import fs from 'fs';
const { default: getAppPort } = await import('../../../test_util/app-port.js');
const port = getAppPort();

import path from 'path';
import bunyan from 'bunyan';
const logger = bunyan.createLogger({ name: 'test-logger' });

import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const agentPort = process.env.INSTANA_AGENT_PORT;

const app = express();
const logPrefix = `Bunyan (${process.pid}):\t`;

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

app.get('/error-large-object-only', (req, res) => {
  logger.error(JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'large_obj.json'), 'utf8')));
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
  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
