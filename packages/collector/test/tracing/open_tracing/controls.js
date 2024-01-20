/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const fetch = require('node-fetch');
const path = require('path');
const portfinder = require('../../test_util/portfinder');
const testUtils = require('../../../../core/test/test_util');
const config = require('../../../../core/test/config');
const agentPort = require('../../globalAgent').PORT;

let expressOpentracingApp;
const appPort = (exports.appPort = portfinder());

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.DISABLE_AUTOMATIC_TRACING = opts.automaticTracingEnabled === false;

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

exports.getPid = () => expressOpentracingApp.pid;

exports.sendRequest = opts =>
  fetch({
    method: opts.method,
    url: `http://127.0.0.1:${appPort}${opts.path}`
  });
