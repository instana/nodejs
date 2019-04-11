/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var utils = require('../../../utils');
var config = require('../../../config');
var agentPort = require('../../../apps/agentStubControls').agentPort;
var appPort = (exports.appPort = 3216);

var app;

exports.registerTestHooks = function(opts) {
  beforeEach(function() {
    opts = opts || {};

    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    app = spawn('node', [path.join(__dirname, 'publisher' + opts.apiType + '.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    app.kill();
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
  return app.pid;
};

exports.sendToQueue = function(message) {
  return request({
    method: 'POST',
    url: 'http://127.0.0.1:' + appPort + '/send-to-queue',
    json: true,
    simple: true,
    body: {
      message: message
    }
  });
};

exports.publish = function(message) {
  return request({
    method: 'POST',
    url: 'http://127.0.0.1:' + appPort + '/publish',
    json: true,
    simple: true,
    body: {
      message: message
    }
  });
};

exports.sendToGetQueue = function(message) {
  return request({
    method: 'POST',
    url: 'http://127.0.0.1:' + appPort + '/send-to-get-queue',
    json: true,
    simple: true,
    body: {
      message: message
    }
  });
};

exports.sendToConfirmQueue = function(message) {
  return request({
    method: 'POST',
    url: 'http://127.0.0.1:' + appPort + '/send-to-confirm-queue',
    json: true,
    simple: true,
    body: {
      message: message
    }
  });
};
