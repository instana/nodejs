/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var errors = require('request-promise/errors');
var request = require('request-promise');
var path = require('path');

var utils = require('../../../utils');
var config = require('../../../config');
var agentPort = require('../../../apps/agentStubControls').agentPort;
var appPort = (exports.appPort = 3213);

var expressElasticsearchApp;

exports.registerTestHooks = function(opts) {
  beforeEach(function() {
    opts = opts || {};

    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    expressElasticsearchApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return waitUntilServerIsUp();
  });

  afterEach(function() {
    expressElasticsearchApp.kill();
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
  return expressElasticsearchApp.pid;
};

exports.deleteIndex = function() {
  return request({
    method: 'DELETE',
    url: 'http://127.0.0.1:' + appPort + '/database',
    headers: {
      'X-INSTANA-L': '0'
    }
  });
};

exports.get = function(opts) {
  return requestWithPath('GET', '/get', opts);
};

exports.search = function(opts) {
  return requestWithPath('GET', '/search', opts);
};

exports.searchAndGet = function(opts) {
  return requestWithPath('GET', '/searchAndGet', opts);
};

exports.index = function(opts) {
  return requestWithPath('POST', '/index', opts);
};

function requestWithPath(method, p, opts) {
  var headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  if (opts.parentSpanId) {
    headers['X-INSTANA-S'] = opts.parentSpanId;
  }

  if (opts.traceId) {
    headers['X-INSTANA-T'] = opts.traceId;
  }

  return request({
    method: method,
    url: 'http://127.0.0.1:' + appPort + p,
    headers: headers,
    qs: {
      id: opts.id,
      q: opts.q,
      index: opts.index
    },
    json: true,
    body: opts.body
  }).catch(errors.StatusCodeError, function(reason) {
    if (opts.rejectWrongStatusCodes) {
      throw reason;
    }
    // treat all status code errors as likely // allowed
    return reason;
  });
}
