/* eslint-disable no-undef */
/* eslint-disable no-console */

'use strict';

var instana = require('../../../../');
instana({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var request = require('request-promise');
var bodyParser = require('body-parser');
var EventEmitter = require('events');
var Promise = require('bluebird');
var express = require('express');
var morgan = require('morgan');

var app = express();
var logPrefix = 'Express / bluebird App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/delayed', function(req, res) {
  Promise.delay(50).then(sendActiveTraceContext.bind(null, res));
});

app.get('/childPromise', function(req, res) {
  Promise.delay(50)
    .then(function() {
      return Promise.delay(20);
    })
    .then(sendActiveTraceContext.bind(null, res));
});

app.get('/childPromiseWithChildSend', function(req, res) {
  Promise.delay(50).then(function() {
    return Promise.delay(20).then(sendActiveTraceContext.bind(null, res));
  });
});

app.get('/combined', function(req, res) {
  Promise.all([Promise.delay(50), Promise.delay(40)]).then(sendActiveTraceContext.bind(null, res));
});

app.get('/rejected', function(req, res) {
  Promise.all([Promise.delay(50), Promise.reject(new Error('bad timing'))]).catch(
    sendActiveTraceContext.bind(null, res)
  );
});

app.get('/childHttpCall', function(req, res) {
  request('http://127.0.0.1:65212')
    .catch(function() {
      return Promise.delay(20);
    })
    .then(function() {
      sendActiveTraceContext(res);
    });
});

app.get('/rejected', function(req, res) {
  Promise.all([Promise.delay(50), Promise.reject(new Error('bad timing'))]).catch(
    sendActiveTraceContext.bind(null, res)
  );
});

app.get('/map', function(req, res) {
  Promise.map([Promise.delay(20), Promise.resolve(42)], function(v) {
    return v * 2;
  }).then(sendActiveTraceContext.bind(null, res));
});

app.get('/eventEmitterBased', function(req, res) {
  var emitter = new EventEmitter();

  new Promise(function(resolve) {
    emitter.on('a', function(value) {
      resolve(value);
    });
  }).then(function() {
    sendActiveTraceContext(res);
  });

  emitter.emit('a', 1);
});

function sendActiveTraceContext(res) {
  res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
}

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
