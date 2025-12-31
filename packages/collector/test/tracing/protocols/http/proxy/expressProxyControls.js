/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const fetch = require('node-fetch-v2');
const path = require('path');
const spawn = require('child_process').spawn;

const portfinder = require('../../../../test_util/portfinder');
const testUtils = require('../../../../../../core/test/test_util');
const config = require('../../../../../../core/test/config');
const agentControls = require('../../../../globalAgent').instance;
let appPort;
let expressProxyApp;

// TODO: rewrite to use a class
function waitUntilServerIsUp() {
  try {
    return testUtils
      .retry(async () => {
        const resp = await fetch(`http://localhost:${appPort}`, {
          method: 'GET',
          headers: {
            'X-INSTANA-L': '0'
          }
        });

        if (!expressProxyApp.collectorInitialized) throw new Error('Collector not fullly initialized.');

        return resp;
      })
      .then(resp => {
        // eslint-disable-next-line no-console
        console.log('[ExpressProxyControls:start] started');
        return resp.text();
      });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[ExpressProxyControls] Error waiting until server is up: ${err.message}`);
    throw err;
  }
}

exports.getPid = () => expressProxyApp.pid;
exports.getPort = () => appPort;

exports.start = async (opts = {}) => {
  const env = Object.create(process.env);
  env.AGENT_PORT = opts.useGlobalAgent ? agentControls.getPort() : opts.agentControls.getPort();
  env.APP_PORT = portfinder();
  appPort = env.APP_PORT;

  env.UPSTREAM_PORT = opts.expressControls ? opts.expressControls.getPort() : null;

  if (opts.stackTraceLength != null) {
    env.STACK_TRACE_LENGTH_TEST = opts.stackTraceLength;
  }

  if (opts.env) {
    Object.assign(env, opts.env);
  }

  env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS = 100;
  env.EXPRESS_VERSION = opts.EXPRESS_VERSION;

  expressProxyApp = spawn('node', [path.join(__dirname, 'expressProxy.js')], {
    stdio: config.getAppStdio(),
    env
  });

  expressProxyApp.on('message', message => {
    if (message === 'instana.collector.initialized') {
      expressProxyApp.collectorInitialized = true;
    }
  });

  return waitUntilServerIsUp();
};

exports.stop = async () => {
  await expressProxyApp.kill();
};

exports.sendRequest = opts => {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;

  const headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }
  const queryParams = new URLSearchParams({
    responseStatus: opts.responseStatus,
    delay: opts.delay,
    url: opts.target,
    httpLib: opts.httpLib
  });
  const url = `http://localhost:${appPort}${opts.path}?${queryParams.toString()}`;

  return fetch(url, {
    method: opts.method,
    url: `http://localhost:${appPort}${opts.path}`,
    headers
  })
    .then(response => response.text())
    .catch(error => {
      throw error;
    });
};
