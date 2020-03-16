'use strict';

const spawn = require('child_process').spawn;
const errors = require('request-promise/errors');
const request = require('request-promise');
const path = require('path');

const utils = require('../../../core/test/utils');
const config = require('../../../core/test/config');
const agentPort = require('./agentStubControls').agentPort;
const appPort = (exports.appPort = 3211);

let expressApp;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.USE_HTTPS = opts.useHttps === true;
    env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS = 0;

    expressApp = spawn('node', [path.join(__dirname, 'express.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp(opts.useHttps);
  });

  afterEach(() => {
    expressApp.kill();
  });
};

function waitUntilServerIsUp(useHttps) {
  return utils.retry(() =>
    request({
      method: 'GET',
      url: getBaseUrl(useHttps),
      headers: {
        'X-INSTANA-L': '0'
      },
      strictSSL: false
    })
  );
}

exports.getPid = () => expressApp.pid;

exports.sendBasicRequest = opts =>
  request({
    method: opts.method,
    url: getBaseUrl(opts.useHttps) + opts.path,
    resolveWithFullResponse: opts.resolveWithFullResponse,
    strictSSL: false
  });

exports.sendRequest = opts => {
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
  }).catch(errors.StatusCodeError, reason => {
    if (reason.statusCode === opts.responseStatus) {
      return true;
    }
    throw reason;
  });
};

exports.setHealthy = useHttps =>
  request({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/admin/set-to-healthy`,
    strictSSL: false
  });

exports.setUnhealthy = useHttps =>
  request({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/admin/set-to-unhealthy`,
    strictSSL: false
  });

exports.setLogger = (useHttps, logFilePath) =>
  request({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/set-logger?logFilePath=${encodeURIComponent(logFilePath)}`,
    strictSSL: false
  });

function getBaseUrl(useHttps) {
  return `http${useHttps ? 's' : ''}://127.0.0.1:${appPort}`;
}
