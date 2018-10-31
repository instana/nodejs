/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var errors = require('request-promise/errors');
var request = require('request-promise');
var path = require('path');

var utils = require('../utils');
var config = require('../config');
var agentPort = require('./agentStubControls').agentPort;
var appPort = (exports.appPort = 3211);

var expressApp;

exports.registerTestHooks = function(opts) {
  beforeEach(function() {
    opts = opts || {};

    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.USE_HTTPS = opts.useHttps === true;

    expressApp = spawn('node', [path.join(__dirname, 'express.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp(opts.useHttps);
  });

  afterEach(function() {
    expressApp.kill();
  });
};

function waitUntilServerIsUp(useHttps) {
  return utils.retry(function() {
    return request({
      method: 'GET',
      url: getBaseUrl(useHttps),
      headers: {
        'X-INSTANA-L': '0'
      },
      strictSSL: false
    });
  });
}

exports.getPid = function() {
  return expressApp.pid;
};

exports.sendBasicRequest = function(opts) {
  return request({
    method: opts.method,
    url: getBaseUrl(opts.useHttps) + opts.path,
    resolveWithFullResponse: opts.resolveWithFullResponse,
    strictSSL: false
  });
};

exports.sendRequest = function(opts) {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;
  opts.headers = opts.headers || {};
  return request({
    method: opts.method,
    url: getBaseUrl(opts.useHttps) + opts.path,
    qs: {
      responseStatus: opts.responseStatus,
      delay: opts.delay,
      cookie: opts.cookie,
      serverTiming: opts.serverTiming,
      serverTimingArray: opts.serverTimingArray
    },
    headers: opts.headers,
    resolveWithFullResponse: opts.resolveWithFullResponse,
    strictSSL: false
  }).catch(errors.StatusCodeError, function(reason) {
    if (reason.statusCode === opts.responseStatus) {
      return true;
    }
    throw reason;
  });
};

exports.setHealthy = function(useHttps) {
  return request({
    method: 'POST',
    url: getBaseUrl(useHttps) + '/admin/set-to-healthy',
    strictSSL: false
  });
};

exports.setUnhealthy = function(useHttps) {
  return request({
    method: 'POST',
    url: getBaseUrl(useHttps) + '/admin/set-to-unhealthy',
    strictSSL: false
  });
};

function getBaseUrl(useHttps) {
  return 'http' + (useHttps ? 's' : '') + '://127.0.0.1:' + appPort;
}
