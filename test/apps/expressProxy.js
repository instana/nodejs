/* eslint-disable */

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    enabled: true,
    forceTransmissionStartingAt: 1,
    stackTraceLength: process.env.STACK_TRACE_LENGTH != null ? parseInt(process.env.STACK_TRACE_LENGTH, 10) : 10
  }
});

var express = require('express');
var request = require('request');
var fetch = require('node-fetch');
var app = express();

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.use(function(req, res) {
  log(req.method, req.url);
  var delay = parseInt(req.query.delay || 0, 10);
  setTimeout(function() {
    var url;
    if (req.query.url) {
      url = req.query.url;
    } else {
      url = 'http://127.0.0.1:' + process.env.UPSTREAM_PORT + '/proxy-call' + req.url;
    }

    if (req.query.httpLib === 'node-fetch') {
      // use node-fetch
      fetch(url, {
        method: req.method,
        timeout: 500
      })
        .then(function(response) {
          res.sendStatus(response.status);
        })
        .catch(function(err) {
          res.sendStatus(500);
          log('Unexpected error', err);
        });
    } else {
      // use request package
      request(
        {
          method: req.method,
          url: url,
          qs: req.query,
          timeout: 500
        },
        function(err, response) {
          if (err) {
            res.sendStatus(500);
            log('Unexpected error', err);
          } else {
            res.sendStatus(response.statusCode);
          }
        }
      );
    }
  }, delay * 0.25);
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express Proxy (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
