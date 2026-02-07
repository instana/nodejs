/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;

const path = require('path');
const portfinder = require('@_local/collector/test/test_util/portfinder');

const testUtils = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const agentControls = require('@_local/collector/test/globalAgent').instance;

let expressApp;
let appPort;

// TODO: transform into class
exports.start = opts => {
  opts = opts || {};

  const env = Object.create(process.env);
  env.AGENT_PORT = opts.useGlobalAgent ? agentControls.getPort() : opts.agentControls.getPort();
  env.APP_PORT = portfinder();

  appPort = env.APP_PORT;

  env.UPSTREAM_PORT = opts.expressControls ? opts.expressControls.getPort() : null;
  env.USE_REQUEST_PROMISE = String(opts.useRequestPromise);

  // eslint-disable-next-line no-console
  console.log(
    // eslint-disable-next-line max-len
    `[AsyncAwaitControls] starting with port: ${appPort}, upstreamPort: ${env.UPSTREAM_PORT} and agentPort: ${env.AGENT_PORT}`
  );

  expressApp = spawn('node', [path.join(__dirname, 'app.js')], {
    stdio: config.getAppStdio(),
    env
  });

  expressApp.on('message', message => {
    if (message === 'instana.collector.initialized') {
      expressApp.collectorInitialized = true;
    }
  });

  return waitUntilServerIsUp();
};

exports.stop = async () => {
  await expressApp.kill();
};

function waitUntilServerIsUp() {
  return testUtils
    .retry(async () => {
      await fetch(`http://127.0.0.1:${appPort}`, {
        method: 'GET',
        headers: {
          'X-INSTANA-L': '0'
        }
      });

      if (!expressApp.collectorInitialized) throw new Error('Collector not fullly initialized.');
    })
    .then(resp => {
      // eslint-disable-next-line no-console
      console.log('[AsyncAwaitControls] started');

      return resp;
    });
}

exports.getPid = () => expressApp.pid;
exports.getPort = () => appPort;

exports.sendRequest = () =>
  fetch(`http://127.0.0.1:${appPort}/getSomething`, {
    method: 'GET',
    url: `http://127.0.0.1:${appPort}/getSomething`,
    resolveWithFullResponse: true
  });
