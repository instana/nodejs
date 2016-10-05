/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var errors = require('request-promise/errors');
var request = require('request-promise');
var path = require('path');

var utils = require('../utils');
var config = require('../config');
var agentPort = require('./agentStubControls').agentPort;
var appPort = exports.appPort = 3211;

var expressApp;

exports.registerTestHooks = function(opts) {
  beforeEach(function() {
    opts = opts || {};

    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;

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
  return expressApp.pid;
};


exports.sendRequest = function(opts) {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;
  return request({
    method: opts.method,
    url: 'http://127.0.0.1:' + appPort + opts.path,
    qs: {
      responseStatus: opts.responseStatus,
      delay: opts.delay,
      cookie: opts.cookie
    },
    resolveWithFullResponse: opts.resolveWithFullResponse
  })
  .catch(errors.StatusCodeError, function(reason) {
    if (reason.statusCode === opts.responseStatus) {
      return true;
    }
    throw reason;
  });
};
