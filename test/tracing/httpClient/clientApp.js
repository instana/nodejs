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
var rp = require('request-promise');
var express = require('express');
var morgan = require('morgan');
var http = require('http');

var app = express();
var logPrefix = 'Express HTTP client: Client (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/timeout', function(req, res) {
  rp({
    method: 'GET',
    url: 'http://127.0.0.1:' + process.env.SERVER_PORT + '/timeout',
    timeout: 500
  })
    .then(function() {
      res.sendStatus(200);
    })
    .catch(function() {
      res.sendStatus(500);
    });
});

app.get('/abort', function(req, res) {
  var clientRequest = http.request({
    method: 'GET',
    hostname: '127.0.0.1',
    port: process.env.SERVER_PORT,
    path: '/timeout'
  });

  clientRequest.end();

  setTimeout(function() {
    clientRequest.abort();
  }, 300);

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
