/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var agentPort = 3210;


exports.registerTestHooks = function() {
  var agentStub;

  beforeEach(function() {
    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;

    agentStub = spawn('node', [path.join(__dirname, 'agentStub.js')], {
      stdio: 'inherit',
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
  return request({
    method: 'GET',
    url: 'http://127.0.0.1:' + agentPort
  })
  .catch(function() {
    return waitUntilServerIsUp();
  });
}
