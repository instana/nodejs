/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var utils = require('../../utils');
var config = require('../../config');
var agentPort = require('../../apps/agentStubControls').agentPort;
var appPort = (exports.appPort = 3215);

var expressOpentracingApp;

exports.registerTestHooks = function(opts) {
  beforeEach(function() {
    opts = opts || {};

    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.DISABLE_AUTOMATIC_TRACING = opts.disableAutomaticTracing === true;

    expressOpentracingApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    expressOpentracingApp.kill();
  });
};

function waitUntilServerIsUp() {
  return utils.retry(function() {
    return request({
      method: 'GET',
      url: 'http://127.0.0.1:' + appPort,
      headers: {
        'X-INSTANA-L': '0'
      }
    });
  });
}

exports.getPid = function() {
  return expressOpentracingApp.pid;
};

exports.sendRequest = function(opts) {
  return request({
    method: opts.method,
    url: 'http://127.0.0.1:' + appPort + opts.path
  });
};
