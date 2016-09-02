/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');
var _ = require('lodash');

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


function waitUntilServerIsUp() {
  return util.retry(function() {
    return request({
      method: 'GET',
      url: 'http://127.0.0.1:' + agentPort
    });
  });
}


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


exports.getLastMetricValue = function(pid, _path) {
  return exports.getRetrievedData()
    .then(function(data) {
      return getLastMetricValue(pid, data, _path);
    });
};

function getLastMetricValue(pid, data, _path) {
  for (var i = data.runtime.length - 1; i >= 0; i--) {
    var runtimeMessage = data.runtime[i];
    if (runtimeMessage.pid !== pid) {
      continue;
    }

    var value = _.get(runtimeMessage.data, _path, undefined);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}
