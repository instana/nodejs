/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const fetch = require('node-fetch-v2');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const portfinder = require('../test_util/portfinder');
const testUtils = require('../../../core/test/test_util');
const config = require('../../../core/test/config');
const agentControls = require('../globalAgent').instance;

const sslDir = path.join(__dirname, 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

let expressApp;
let appPort;

// TODO: transform into class
exports.start = function start(opts = {}, retryTime = null) {
  const env = Object.create(process.env);
  env.AGENT_PORT = opts.useGlobalAgent ? agentControls.getPort() : opts.agentControls.getPort();
  env.APP_PORT = portfinder();
  appPort = env.APP_PORT;

  env.TRACING_ENABLED = opts.enableTracing !== false;
  env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
  env.APP_USES_HTTPS = opts.useHttps === true;

  if (env.APP_USES_HTTPS) {
    // CASE: target app uses HTTPS (self cert)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS = 0;
  env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS = 100;
  env.INSTANA_LOG_LEVEL = 'warn';

  if (opts.env && opts.env.INSTANA_LOG_LEVEL) {
    env.INSTANA_LOG_LEVEL = opts.env.INSTANA_LOG_LEVEL;
  }

  // eslint-disable-next-line no-console
  console.log(
    // eslint-disable-next-line max-len
    `[ExpressControls:start] starting with port: ${appPort}  and agentPort: ${env.AGENT_PORT}`
  );

  expressApp = spawn('node', [path.join(__dirname, 'express.js')], {
    stdio: config.getAppStdio(),
    env
  });

  expressApp.on('message', message => {
    if (message === 'instana.collector.initialized') {
      expressApp.collectorInitialized = true;
    }
  });

  return waitUntilServerIsUp(opts.useHttps, retryTime, opts.collectorUninitialized);
};

function waitUntilServerIsUp(useHttps, retryTime, collectorUninitialized) {
  try {
    return testUtils
      .retry(async () => {
        const resp = await fetch(getBaseUrl(useHttps), {
          method: 'GET',
          url: getBaseUrl(useHttps),
          headers: {
            'X-INSTANA-L': '0'
          },
          ca: cert
        });

        if (collectorUninitialized) return resp;
        if (!expressApp.collectorInitialized) throw new Error('Collector not fullly initialized.');

        return resp;
      }, retryTime)
      .then(resp => {
        // eslint-disable-next-line no-console
        console.log(
          // eslint-disable-next-line max-len
          `[ExpressControls:start] started with port: ${appPort} and pid ${expressApp.pid}`
        );

        return resp.text();
      });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[ExpressControls] Error waiting until server (${getBaseUrl(useHttps)}) is up: ${err.message}`);
    throw err;
  }
}

exports.stop = function stop() {
  expressApp.kill();
};

exports.getPort = () => appPort;
exports.getPid = () => expressApp.pid;

exports.sendBasicRequest = opts =>
  fetch(`${getBaseUrl(opts.useHttps)}${opts.path}`, {
    method: opts.method,
    url: getBaseUrl(opts.useHttps) + opts.path,
    resolveWithFullResponse: opts.resolveWithFullResponse
  }).then(response => {
    return response.json();
  });

exports.sendRequest = opts => {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;
  opts.headers = opts.headers || {};
  return fetch(`${getBaseUrl(opts.useHttps)}${opts.path}?responseStatus=${opts.responseStatus}&delay=${opts.delay}`, {
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
    resolveWithFullResponse: opts.resolveWithFullResponse
  })
    .then(response => {
      const contentType = response.headers.get('content-type');
      if (contentType && (contentType.includes('text/html') || contentType.includes('text/plain'))) {
        return response.text();
      }
      return response.json();
    })
    .catch(response => {
      if (response && response.status === opts.responseStatus) {
        return true;
      }
      throw new Error(`Unexpected response status: ${response.status}`);
    });
};

exports.setHealthy = useHttps =>
  fetch(`${getBaseUrl(useHttps)}/admin/set-to-healthy`, {
    url: `${getBaseUrl(useHttps)}/admin/set-to-healthy`,
    method: 'POST'
  }).then(response => {
    return response.json();
  });

exports.setUnhealthy = useHttps =>
  fetch(`${getBaseUrl(useHttps)}/admin/set-to-unhealthy`, {
    url: `${getBaseUrl(useHttps)}/admin/set-to-unhealthy`,
    method: 'POST'
  }).then(response => {
    return response.json();
  });

exports.setLogger = (useHttps, logFilePath) =>
  fetch(`${getBaseUrl(useHttps)}/set-logger?logFilePath=${encodeURIComponent(logFilePath)}`, {
    url: `${getBaseUrl(useHttps)}/set-logger?logFilePath=${encodeURIComponent(logFilePath)}`,
    method: 'POST'
  }).then(response => {
    return response.json();
  });

function getBaseUrl(useHttps) {
  return `http${useHttps ? 's' : ''}://localhost:${appPort}`;
}
