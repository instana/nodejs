'use strict';

const errors = require('request-promise/errors');
const fs = require('fs');
const path = require('path');
const request = require('request-promise');
const spawn = require('child_process').spawn;

const testUtils = require('../../../core/test/test_util');
const config = require('../../../core/test/config');
const agentPort = require('./agentStubControls').agentPort;
const appPort = (exports.appPort = 3211);

const sslDir = path.join(__dirname, 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

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
  return testUtils.retry(() =>
    request({
      method: 'GET',
      url: getBaseUrl(useHttps),
      headers: {
        'X-INSTANA-L': '0'
      },
      ca: cert
    })
  );
}

exports.getPid = () => expressApp.pid;

exports.sendBasicRequest = opts =>
  request({
    method: opts.method,
    url: getBaseUrl(opts.useHttps) + opts.path,
    resolveWithFullResponse: opts.resolveWithFullResponse,
    ca: cert
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
    ca: cert
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
    ca: cert
  });

exports.setUnhealthy = useHttps =>
  request({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/admin/set-to-unhealthy`,
    ca: cert
  });

exports.setLogger = (useHttps, logFilePath) =>
  request({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/set-logger?logFilePath=${encodeURIComponent(logFilePath)}`,
    ca: cert
  });

function getBaseUrl(useHttps) {
  return `http${useHttps ? 's' : ''}://localhost:${appPort}`;
}
