/* eslint-disable no-console */

'use strict';

var agentPort = process.env.AGENT_PORT;

var dummyLogger = {
  debug: function() {
    // omit debug calls to not pollute test logs
  },
  info: console.log,
  warn: console.warn,
  error: console.error
};

var instana = require('../../../..');
instana({
  agentPort: agentPort,
  logger: dummyLogger,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});
var instanaLogger;
instanaLogger = require('../../../../src/logger').getLogger('test-module-name', function(newLogger) {
  instanaLogger = newLogger;
});

var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');

var app = express();
var logPrefix = 'Express / Bunyan App [Instana receives non-Bunyan logger] (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/trigger', function(req, res) {
  instanaLogger.error('An error logged by Instana - this must not be traced');
  res.sendStatus(200);
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
