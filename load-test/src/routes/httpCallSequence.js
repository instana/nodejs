'use strict';

var router = module.exports = exports = require('express').Router();
var request = require('request-promise-any');
var Promise = require('bluebird');
var config = require('../config');
var http = require('http');

var keepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 5000,
  // deliberately leaking sockets in the load test!
  maxSockets: Infinity,
  maxFreeSockets: 256
});

router.get('/httpCallSequence', function(req, res) {
  if (config.app.downstreamHttpPort == null) {
    res.send('OK');
    return;
  }

  executeDownstreamCall()
    .then(function() {
      return Promise.delay(100);
    })
    .then(function() {
      return Promise.all([
        executeDownstreamCall(),
        executeDownstreamCall(),
        Promise.delay(20)
      ]);
    })
    .then(function() {
      res.sendStatus(200);
    })
    .catch(function(err) {
      console.log('Failed to execute call sequence:', err.message);
      res.sendStatus(500);
    });
});

function executeDownstreamCall() {
  return request({
    uri: 'http://127.0.0.1:' + config.app.downstreamHttpPort + '/httpCallSequence',
    resolveWithFullResponse: true,
    timeout: 3000,
    agent: keepAliveAgent
  });
}
