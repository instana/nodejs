'use strict';

const spawn = require('child_process').spawn;
const errors = require('request-promise/errors');
const request = require('request-promise');
const path = require('path');

const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const appPort = (exports.appPort = 3213);

let expressElasticsearchApp;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    expressElasticsearchApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressElasticsearchApp.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(() =>
    request({
      method: 'GET',
      url: `http://127.0.0.1:${appPort}`,
      headers: {
        'X-INSTANA-L': '0'
      }
    })
  );
}

exports.getPid = () => expressElasticsearchApp.pid;

exports.deleteIndex = () =>
  request({
    method: 'DELETE',
    url: `http://127.0.0.1:${appPort}/database`,
    headers: {
      'X-INSTANA-L': '0'
    }
  });

exports.get = opts => requestWithPath('GET', '/get', opts);

exports.search = opts => requestWithPath('GET', '/search', opts);

exports.mget1 = opts => requestWithPath('GET', '/mget1', opts);

exports.mget2 = opts => requestWithPath('GET', '/mget2', opts);

exports.msearch = opts => requestWithPath('GET', '/msearch', opts);

exports.searchAndGet = opts => requestWithPath('GET', '/searchAndGet', opts);

exports.index = opts => requestWithPath('POST', '/index', opts);

function requestWithPath(method, p, opts) {
  const headers = {};
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
    method,
    url: `http://127.0.0.1:${appPort}${p}`,
    headers,
    qs: {
      id: opts.id,
      q: opts.q,
      index: opts.index
    },
    json: true,
    body: opts.body
  }).catch(errors.StatusCodeError, reason => {
    if (opts.rejectWrongStatusCodes) {
      throw reason;
    }
    // treat all status code errors as likely // allowed
    return reason;
  });
}
