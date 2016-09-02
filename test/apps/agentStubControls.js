/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var util = require('../util');
var config = require('../config');

var agentPort = exports.agentPort = 3210;

var agentStub;

exports.registerTestHooks = function() {
  beforeEach(function() {
    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;

    agentStub = spawn('node', [path.join(__dirname, 'agentStub.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    agentStub.kill();
  });
};


exports.getDiscoveries = function() {
  return request({
    method: 'GET',
    url: 'http://127.0.0.1:' + agentPort + '/discoveries',
    json: true
  });
};


exports.getRetrievedData = function() {
  return request({
    method: 'GET',
    url: 'http://127.0.0.1:' + agentPort + '/retrievedData',
    json: true
  });
};


function waitUntilServerIsUp() {
  return util.retry(function() {
    return request({
      method: 'GET',
      url: 'http://127.0.0.1:' + agentPort
    });
  });
}
