/* eslint-disable no-console */

'use strict';

var instana = require('../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');

var app = express();
var logPrefix = 'API: Server (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/span/active', function(req, res) {
  var span = instana.currentSpan();
  res.json({
    span: serialize(span)
  });
});

app.get('/span/manuallyended', function(req, res) {
  var span = instana.currentSpan();
  span.disableAutoEnd();
  span.end(42);
  res.json({
    span: serialize(span)
  });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function serialize(span) {
  return {
    traceId: span.getTraceId(),
    spanId: span.getSpanId(),
    parentSpanId: span.getParentSpanId(),
    name: span.getName(),
    isEntry: span.isEntrySpan(),
    isExit: span.isExitSpan(),
    isIntermediate: span.isIntermediateSpan(),
    timestamp: span.getTimestamp(),
    duration: span.getDuration(),
    errorCount: span.getErrorCount(),
    handleConstructorName: span.constructor.name
  };
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
