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

var pinoOptions = {
  customLevels: {
    customInfo: 31,
    customError: 51
  }
};
var pino = require('pino');
var plainVanillaPino = pino(pinoOptions);
var expressPino = require('express-pino-logger')(pinoOptions);

var app = express();
var logPrefix = 'Express / Pino App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(expressPino);

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/info', function(req, res) {
  plainVanillaPino.info('Info message - must not be traced.');
  finish(res);
});

app.get('/warn', function(req, res) {
  plainVanillaPino.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/error', function(req, res) {
  plainVanillaPino.error('Error message - should be traced.');
  finish(res);
});

app.get('/fatal', function(req, res) {
  plainVanillaPino.fatal('Fatal message - should be traced.');
  finish(res);
});

app.get('/custom-info', function(req, res) {
  plainVanillaPino.customInfo('Custom info level message - should not be traced.');
  finish(res);
});

app.get('/custom-error', function(req, res) {
  plainVanillaPino.customError('Custom error level message - should be traced.');
  finish(res);
});

app.get('/error-object-only', function(req, res) {
  plainVanillaPino.error(new Error('This is an error.'));
  finish(res);
});

app.get('/error-random-object-only', function(req, res) {
  plainVanillaPino.error({ foo: { bar: 'baz' } });
  finish(res);
});

app.get('/error-object-and-string', function(req, res) {
  plainVanillaPino.error(new Error('This is an error.'), 'Error message - should be traced.');
  finish(res);
});

app.get('/error-random-object-and-string', function(req, res) {
  plainVanillaPino.error({ foo: { bar: 'baz' } }, 'Error message - should be traced.');
  finish(res);
});

app.get('/child-error', function(req, res) {
  var child = plainVanillaPino.child({ a: 'property' });
  child.error('Child logger error message - should be traced.');
  finish(res);
});

app.get('/express-pino-info', function(req, res) {
  req.log.info('Info message - must not be traced.');
  finish(res);
});

app.get('/express-pino-warn', function(req, res) {
  req.log.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/express-pino-error', function(req, res) {
  req.log.error('Error message - should be traced.');
  finish(res);
});

app.get('/express-pino-fatal', function(req, res) {
  req.log.fatal('Fatal message - should be traced.');
  finish(res);
});

app.get('/express-pino-custom-info', function(req, res) {
  req.log.customInfo('Custom info level message - should not be traced.');
  finish(res);
});

app.get('/express-pino-custom-error', function(req, res) {
  req.log.customError('Custom error level message - should be traced.');
  finish(res);
});

app.get('/express-pino-error-object-only', function(req, res) {
  req.log.error(new Error('This is an error.'));
  finish(res);
});

app.get('/express-pino-error-random-object-only', function(req, res) {
  req.log.error({ foo: { bar: 'baz' } });
  finish(res);
});

app.get('/express-pino-error-object-and-string', function(req, res) {
  req.log.error(new Error('This is an error.'), 'Error message - should be traced.');
  finish(res);
});

app.get('/express-pino-error-random-object-and-string', function(req, res) {
  req.log.error({ foo: { bar: 'baz' } }, 'Error message - should be traced.');
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
