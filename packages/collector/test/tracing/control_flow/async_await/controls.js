/* eslint-env mocha */

'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../utils');
const config = require('../../../config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const appPort = (exports.appPort = 3217);

let expressApp;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = opts.upstreamPort;
    env.USE_REQUEST_PROMISE = String(opts.useRequestPromise);

    expressApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressApp.kill();
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

exports.getPid = () => expressApp.pid;

exports.sendRequest = () =>
  request({
    method: 'GET',
    url: `http://127.0.0.1:${appPort}/getSomething`,
    resolveWithFullResponse: true
  });
