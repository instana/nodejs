/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const fetch = require('node-fetch');
const path = require('path');
const portfinder = require('../../../test_util/portfinder');

const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');
const agentControls = require('../../../globalAgent').instance;

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
    env.AMQPLIB_VERSION = opts.version;

    app = spawn('node', [path.join(__dirname, `publisher${opts.apiType}.js`)], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    app.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(() =>
    fetch(`http://127.0.0.1:${appPort}`, {
      method: 'GET',
      headers: {
        'X-INSTANA-L': '0'
      }
    })
  );
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
