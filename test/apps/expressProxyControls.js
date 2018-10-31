/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var errors = require('request-promise/errors');
var request = require('request-promise');
var path = require('path');

var utils = require('../utils');
var config = require('../config');
var agentPort = require('./agentStubControls').agentPort;
var upstreamPort = require('./expressControls').appPort;
var appPort = (exports.appPort = 3212);

var expressProxyApp;

exports.registerTestHooks = function(opts) {
  opts = opts || {};
  beforeEach(function() {
    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;

    expressProxyApp = spawn('node', [path.join(__dirname, 'expressProxy.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    expressProxyApp.kill();
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
  return expressProxyApp.pid;
};

exports.sendRequest = function(opts) {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;

  var headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: 'http://127.0.0.1:' + appPort + opts.path,
    qs: {
      responseStatus: opts.responseStatus,
      delay: opts.delay,
      url: opts.target,
      httpLib: opts.httpLib
    },
    headers: headers
  }).catch(errors.StatusCodeError, function(reason) {
    // treat all status code errors as likely // allowed
    return reason;
  });
};
