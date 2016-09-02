/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var util = require('../util');
var config = require('../config');
var agentPort = require('./agentStubControls').agentPort;
var appPort = exports.appPort = 3211;

var expressApp;

exports.registerTestHooks = function() {
  beforeEach(function() {
    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;

    expressApp = spawn('node', [path.join(__dirname, 'express.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    expressApp.kill();
  });
};


exports.getPid = function() {
  return expressApp.pid;
};


function waitUntilServerIsUp() {
  return util.retry(function() {
    return request({
      method: 'GET',
      url: 'http://127.0.0.1:' + appPort
    });
  });
}
