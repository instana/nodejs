/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var utils = require('../utils');
var config = require('../config');
var agentPort = require('./agentStubControls').agentPort;
var upstreamPort = require('./expressControls').appPort;
var appPort = exports.appPort = 3218;

var expressPgApp;

exports.registerTestHooks = function(opts) {
  opts = opts || {};
  beforeEach(function() {
    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    expressPgApp = spawn('node', [path.join(__dirname, 'expressPg.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    expressPgApp.kill();
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
  return expressPgApp.pid;
};

exports.sendRequest = function(opts) {
  var headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: 'http://127.0.0.1:' + appPort + opts.path,
    json: true,
    body: opts.body,
    headers: headers
  });
};


exports.addValue = function(value) {
  return request({
    method: 'post',
    url: 'http://127.0.0.1:' + appPort + '/values',
    qs: {
      value: value
    }
  });
};

exports.getNow = function() {
  return request({
    method: 'get',
    url: 'http://127.0.0.1:' + appPort + '/select-now'
  });
};

exports.getValues = function() {
  return request({
    method: 'get',
    url: 'http://127.0.0.1:' + appPort + '/values'
  });
};

exports.getValuesAndProduceError = function() {
  return request({
    method: 'get',
    url: 'http://127.0.0.1:' + appPort + '/values/error'
  });
};
