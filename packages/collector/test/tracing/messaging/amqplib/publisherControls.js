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

let app;
let appPort;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentControls.getPort();
    env.APP_PORT = portfinder();
    appPort = env.APP_PORT;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS = 100;

    app = spawn('node', [path.join(__dirname, `publisher${opts.apiType}.js`)], {
      stdio: config.getAppStdio(),
      env
    });

    app.on('message', message => {
      if (message === 'instana.collector.initialized') {
        app.collectorInitialized = true;
      }
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    app.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(async () => {
    await fetch(`http://127.0.0.1:${appPort}`, {
      method: 'GET',
      headers: {
        'X-INSTANA-L': '0'
      }
    });

    if (!app.collectorInitialized) throw new Error('Collector not fullly initialized.');
  });
}

exports.getPid = () => app.pid;

exports.sendToQueue = (message, headers) =>
  fetch(`http://127.0.0.1:${appPort}/send-to-queue`, {
    method: 'POST',
    simple: true,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      message
    })
  }).then(response => response.text());

exports.publish = (message, headers) =>
  fetch(`http://127.0.0.1:${appPort}/publish`, {
    method: 'POST',
    simple: true,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      message
    })
  }).then(response => response.text());

exports.sendToGetQueue = (message, headers) =>
  fetch(`http://127.0.0.1:${appPort}/send-to-get-queue`, {
    method: 'POST',
    simple: true,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      message
    })
  }).then(response => response.text());

exports.publishToConfirmChannelWithoutCallback = (message, headers) =>
  fetch(`http://127.0.0.1:${appPort}/publish-to-confirm-channel-without-callback`, {
    method: 'POST',
    simple: true,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      message
    })
  }).then(response => response.text());

exports.sendToConfirmQueue = (message, headers) =>
  fetch(`http://127.0.0.1:${appPort}/send-to-confirm-queue`, {
    method: 'POST',
    simple: true,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      message
    })
  }).then(response => response.text());
