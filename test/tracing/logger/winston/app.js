/* eslint-disable no-console */

'use strict';

var agentPort = process.env.AGENT_PORT;

var instana = require('../../../..');
instana({
  agentPort: agentPort,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var request = require('request-promise');
var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');

var winston = require('winston');
winston.add(new winston.transports.Console({ level: 'info' }));

var logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console({ level: 'info' })]
});

var app = express();
var logPrefix = 'Express / Winston App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/info', function(req, res) {
  logger.info('Info message - must not be traced.');
  finish(res);
});

app.get('/warn', function(req, res) {
  logger.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/error', function(req, res) {
  logger.error('Error message - should be traced.');
  finish(res);
});

app.get('/log-info', function(req, res) {
  logger.log('info', 'Info message - must not be traced.');
  finish(res);
});

app.get('/log-warn', function(req, res) {
  logger.log('warn', 'Warn message - should be traced.');
  finish(res);
});

app.get('/log-error', function(req, res) {
  logger.log('error', 'Error message - should be traced.');
  finish(res);
});

app.get('/global-info', function(req, res) {
  winston.info('Info message - must not be traced.');
  finish(res);
});

app.get('/global-warn', function(req, res) {
  winston.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/global-error', function(req, res) {
  winston.error('Error message - should be traced.');
  finish(res);
});

app.get('/global-log-info', function(req, res) {
  winston.log('info', 'Info message - must not be traced.');
  finish(res);
});

app.get('/global-log-warn', function(req, res) {
  winston.log('warn', 'Warn message - should be traced.');
  finish(res);
});

app.get('/global-log-error', function(req, res) {
  winston.log('error', 'Error message - should be traced.');
  finish(res);
});

function finish(res) {
  request('http://127.0.0.1:' + agentPort).then(function() {
    res.sendStatus(200);
  });
}

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
