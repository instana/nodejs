/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const spawn = require('child_process').spawn;
const portfinder = require('../test_util/portfinder');
const testUtils = require('../../../core/test/test_util');
const config = require('../../../core/test/config');
const legacyAgentPort = require('./agentStubControls').agentPort;
const globalAgentPort = require('../globalAgent').PORT;

const sslDir = path.join(__dirname, 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

let expressApp;
const appPort = (exports.appPort = portfinder());

exports.registerTestHooks = opts => {
  beforeEach(() => exports.start(opts));
  afterEach(() => exports.stop());
};

exports.start = function start(opts = {}, retryTime = null) {
  const env = Object.create(process.env);
  env.AGENT_PORT = opts.useGlobalAgent ? globalAgentPort : legacyAgentPort;
  env.APP_PORT = appPort;
  env.TRACING_ENABLED = opts.enableTracing !== false;
  env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
  env.USE_HTTPS = opts.useHttps === true;
  env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS = 0;
  env.INSTANA_LOG_LEVEL = 'warn';
  if (opts.env && opts.env.INSTANA_LOG_LEVEL) {
    env.INSTANA_LOG_LEVEL = opts.env.INSTANA_LOG_LEVEL;
  }

  expressApp = spawn('node', [path.join(__dirname, 'express.js')], {
    stdio: config.getAppStdio(),
    env
  });

  return waitUntilServerIsUp(opts.useHttps, retryTime);
};

function waitUntilServerIsUp(useHttps, retryTime) {
  return testUtils.retry(
    () =>
      fetch({
        method: 'GET',
        url: getBaseUrl(useHttps),
        headers: {
          'X-INSTANA-L': '0'
        },
        ca: cert
      }),
    retryTime
  );
}

exports.stop = function stop() {
  expressApp.kill();
};

exports.getPid = () => expressApp.pid;

exports.sendBasicRequest = opts =>
  fetch({
    method: opts.method,
    url: getBaseUrl(opts.useHttps) + opts.path,
    resolveWithFullResponse: opts.resolveWithFullResponse,
    ca: cert
  });

exports.sendRequest = opts => {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;
  opts.headers = opts.headers || {};
  return fetch({
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
  }).catch(response => {
    if (response.status === opts.responseStatus) {
      return true;
    }
    throw new Error(`Unexpected response status: ${response.status}`);
  });
};

exports.setHealthy = useHttps =>
  fetch({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/admin/set-to-healthy`,
    ca: cert
  });

exports.setUnhealthy = useHttps =>
  fetch({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/admin/set-to-unhealthy`,
    ca: cert
  });

exports.setLogger = (useHttps, logFilePath) =>
  fetch({
    method: 'POST',
    url: `${getBaseUrl(useHttps)}/set-logger?logFilePath=${encodeURIComponent(logFilePath)}`,
    ca: cert
  });

function getBaseUrl(useHttps) {
  return `http${useHttps ? 's' : ''}://localhost:${appPort}`;
}
