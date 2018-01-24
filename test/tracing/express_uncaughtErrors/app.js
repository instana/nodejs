/* eslint-disable no-console */

'use strict';

require('../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');

var app = express();
var logPrefix = 'Express uncaughtErrors App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/customErrorHandler', function(req, res) { // eslint-disable-line
  throw new Error('To be caught by custom error handler');
});

app.use(function(err, req, res, next) { // eslint-disable-line
  res.sendStatus(400);
});

app.get('/defaultErrorHandler', function(req, res) {  // eslint-disable-line
  throw new Error('To be caught by default error handler');
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
