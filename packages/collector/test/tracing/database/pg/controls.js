/* eslint-env mocha */

'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../utils');
const config = require('../../../config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const upstreamPort = require('../../../apps/expressControls').appPort;
const appPort = (exports.appPort = 3218);

const errors = require('request-promise/errors');

let expressPgApp;

exports.registerTestHooks = opts => {
  opts = opts || {};
  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    expressPgApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressPgApp.kill();
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

exports.getPid = () => expressPgApp.pid;

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
  }).catch(errors.StatusCodeError, reason => {
    if (opts.rejectWrongStatusCodes) {
      throw reason;
    }
    // treat all status code errors as likely // allowed
    return reason;
  });
};
