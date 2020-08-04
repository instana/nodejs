'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const upstreamPort = require('../../../apps/expressControls').appPort;
const appPort = (exports.appPort = 3214);

let expressMongodbApp;

exports.registerTestHooks = (opts = {}) => {
  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    expressMongodbApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressMongodbApp.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(() =>
    request({
      method: 'GET',
      url: `http://127.0.0.1:${appPort}`,
      headers: {
        'X-INSTANA-L': '0'
      }
    })
  );
}

exports.getPid = () => expressMongodbApp.pid;

exports.sendRequest = opts => {
  const headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: `http://127.0.0.1:${appPort}${opts.path}`,
    json: true,
    body: opts.body,
    headers
  });
};
