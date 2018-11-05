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

var bunyan = require('bunyan');
var logger = bunyan.createLogger({ name: 'test-logger' });

var app = express();
var logPrefix = 'Express / Bunyan App (' + process.pid + '):\t';

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

app.get('/fatal', function(req, res) {
  logger.fatal('Fatal message - should be traced.');
  finish(res);
});

app.get('/error-object-only', function(req, res) {
  logger.error(new Error('This is an error.'));
  finish(res);
});

app.get('/error-random-object-only', function(req, res) {
  logger.error({ foo: { bar: 'baz' } });
  finish(res);
});

app.get('/error-object-and-string', function(req, res) {
  logger.error(new Error('This is an error.'), 'Error message - should be traced.');
  finish(res);
});

app.get('/error-random-object-and-string', function(req, res) {
  logger.error({ foo: { bar: 'baz' } }, 'Error message - should be traced.');
  finish(res);
});

app.get('/child-error', function(req, res) {
  var child = logger.child({ a: 'property' });
  child.error('Child logger error message - should be traced.');
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
