/* eslint-disable */

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1,
    stackTraceLength: process.env.STACK_TRACE_LENGTH != null ? parseInt(process.env.STACK_TRACE_LENGTH, 10) : 10
  }
});

var express = require('express');
var app = express();


app.use(function(req, res) {
  log(req.method, req.url);
  var delay = parseInt(req.query.delay || 0, 10);
  var responseStatus = parseInt(req.query.responseStatus || 200, 10);

  setTimeout(function() {
    res.sendStatus(responseStatus);
  }, delay);
});


app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('Express App (' + process.pid + '):\t');
  console.log.apply(console, args);
}
