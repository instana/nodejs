/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var path = require('path');

var utils = require('../../../utils');
var config = require('../../../config');
var agentPort = require('../../../apps/agentStubControls').agentPort;
var upstreamPort = require('../../../apps/expressControls').appPort;
var appPort = (exports.appPort = 3215);

var expressMysqlApp;

exports.registerTestHooks = function(opts) {
  opts = opts || {};
  beforeEach(function() {
    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.MYSQL_2_DRIVER = opts.useMysql2 === true;
    env.MYSQL_2_WITH_PROMISES = opts.useMysql2WithPromises === true;

    expressMysqlApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    expressMysqlApp.kill();
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
  return expressMysqlApp.pid;
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

/**
 * Executes a MySQL INSERT and then does an HTTP client call. Used to verify that the tracing context is not corrupted.
 */
exports.addValueAndDoCall = function(value) {
  return request({
    method: 'post',
    url: 'http://127.0.0.1:' + appPort + '/valuesAndCall',
    qs: {
      value: value
    }
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
