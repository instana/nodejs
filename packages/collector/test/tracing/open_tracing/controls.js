'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../../core/test/utils');
const config = require('../../../../core/test/config');
const agentPort = require('../../apps/agentStubControls').agentPort;
const appPort = (exports.appPort = 3215);

let expressOpentracingApp;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.DISABLE_AUTOMATIC_TRACING = opts.disableAutomaticTracing === true;

    expressOpentracingApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressOpentracingApp.kill();
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

exports.getPid = () => expressOpentracingApp.pid;

exports.sendRequest = opts =>
  request({
    method: opts.method,
    url: `http://127.0.0.1:${appPort}${opts.path}`
  });
