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
const agentPort = require('../../../globalAgent').PORT;

let app;
const appPort = (exports.appPort = portfinder());

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
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
    fetch({
      method: 'GET',
      url: `http://127.0.0.1:${appPort}`,
      headers: {
        'X-INSTANA-L': '0'
      }
    })
  );
}

exports.getPid = () => app.pid;

exports.sendToQueue = (message, headers) =>
  fetch({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-to-queue`,
    json: true,
    simple: true,
    headers,
    body: {
      message
    }
  });

exports.publish = (message, headers) =>
  fetch({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/publish`,
    json: true,
    simple: true,
    headers,
    body: {
      message
    }
  });

exports.sendToGetQueue = (message, headers) =>
  fetch({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-to-get-queue`,
    json: true,
    simple: true,
    headers,
    body: {
      message
    }
  });

exports.publishToConfirmChannelWithoutCallback = (message, headers) =>
  fetch({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/publish-to-confirm-channel-without-callback`,
    json: true,
    simple: true,
    headers,
    body: {
      message
    }
  });

exports.sendToConfirmQueue = (message, headers) =>
  fetch({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-to-confirm-queue`,
    json: true,
    simple: true,
    headers,
    body: {
      message
    }
  });
