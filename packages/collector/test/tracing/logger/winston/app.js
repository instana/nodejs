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

const winston = require('winston');
winston.add(new winston.transports.Console({ level: 'info' }));

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console({ level: 'info' })]
});

const app = express();
const logPrefix = `Express / Winston App (${process.pid}):\t`;

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

app.get('/log-info', (req, res) => {
  logger.log('info', 'Info message - must not be traced.');
  finish(res);
});

app.get('/log-warn', (req, res) => {
  logger.log('warn', 'Warn message - should be traced.');
  finish(res);
});

app.get('/log-error', (req, res) => {
  logger.log('error', 'Error message - should be traced.');
  finish(res);
});

app.get('/global-info', (req, res) => {
  winston.info('Info message - must not be traced.');
  finish(res);
});

app.get('/global-warn', (req, res) => {
  winston.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/global-error', (req, res) => {
  winston.error('Error message - should be traced.');
  finish(res);
});

app.get('/global-log-info', (req, res) => {
  winston.log('info', 'Info message - must not be traced.');
  finish(res);
});

app.get('/global-log-warn', (req, res) => {
  winston.log('warn', 'Warn message - should be traced.');
  finish(res);
});

app.get('/global-log-error', (req, res) => {
  winston.log('error', 'Error message - should be traced.');
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
