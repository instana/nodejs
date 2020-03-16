'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../../../core/test/utils');
const config = require('../../../../../core/test/config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const appPort = (exports.appPort = 3216);

let app;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;

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
  return utils.retry(() =>
    request({
      method: 'GET',
      url: `http://127.0.0.1:${appPort}`,
      headers: {
        'X-INSTANA-L': '0'
      }
    })
  );
}

exports.getPid = () => app.pid;

exports.sendToQueue = message =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-to-queue`,
    json: true,
    simple: true,
    body: {
      message
    }
  });

exports.publish = message =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/publish`,
    json: true,
    simple: true,
    body: {
      message
    }
  });

exports.sendToGetQueue = message =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-to-get-queue`,
    json: true,
    simple: true,
    body: {
      message
    }
  });

exports.sendToConfirmQueue = message =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-to-confirm-queue`,
    json: true,
    simple: true,
    body: {
      message
    }
  });
