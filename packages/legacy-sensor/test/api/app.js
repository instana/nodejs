/* eslint-disable no-console */

'use strict';

var instana = require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: false
  }
});

var express = require('express');
var morgan = require('morgan');

var app = express();
var logPrefix = 'Express App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.get('/', function(req, res) {
  return res.sendStatus(200);
});

app.get('/api', function(req, res) {
  return res.send({
    currentSpan: typeof instana.currentSpan,
    sdk: {
      callback: {
        startEntrySpan: typeof instana.sdk.callback.startEntrySpan,
        completeEntrySpan: typeof instana.sdk.callback.completeEntrySpan,
        startIntermediateSpan: typeof instana.sdk.callback.startIntermediateSpan,
        completeIntermediateSpan: typeof instana.sdk.callback.completeIntermediateSpan,
        startExitSpan: typeof instana.sdk.callback.startExitSpan,
        completeExitSpan: typeof instana.sdk.callback.completeExitSpan
      },
      promise: {
        startEntrySpan: typeof instana.sdk.promise.startEntrySpan,
        completeEntrySpan: typeof instana.sdk.promise.completeEntrySpan,
        startIntermediateSpan: typeof instana.sdk.promise.startIntermediateSpan,
        completeIntermediateSpan: typeof instana.sdk.promise.completeIntermediateSpan,
        startExitSpan: typeof instana.sdk.promise.startExitSpan,
        completeExitSpan: typeof instana.sdk.promise.completeExitSpan
      }
    },
    setLogger: typeof instana.setLogger,
    opentracing: {
      init: typeof instana.opentracing.init,
      createTracer: typeof instana.opentracing.createTracer,
      activate: typeof instana.opentracing.activate,
      deactivate: typeof instana.opentracing.deactivate
    }
  });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
