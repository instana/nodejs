/* eslint-env mocha */

'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../../../core/test/utils');
const config = require('../../../../../core/test/config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const upstreamPort = require('../../../apps/expressControls').appPort;
const appPort = (exports.appPort = 3215);

let expressMysqlApp;

exports.registerTestHooks = opts => {
  opts = opts || {};
  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.DRIVER_MODE = opts.driverMode;
    if (opts.useExecute) {
      env.USE_EXECUTE = true;
    }

    expressMysqlApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressMysqlApp.kill();
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

exports.getPid = () => expressMysqlApp.pid;

exports.addValue = value =>
  request({
    method: 'post',
    url: `http://127.0.0.1:${appPort}/values`,
    qs: {
      value
    }
  });

/**
 * Executes a MySQL INSERT and then does an HTTP client call. Used to verify that the tracing context is not corrupted.
 */
exports.addValueAndDoCall = value =>
  request({
    method: 'post',
    url: `http://127.0.0.1:${appPort}/valuesAndCall`,
    qs: {
      value
    }
  });

exports.getValues = () =>
  request({
    method: 'get',
    url: `http://127.0.0.1:${appPort}/values`
  });

exports.getValuesAndProduceError = () =>
  request({
    method: 'get',
    url: `http://127.0.0.1:${appPort}/values/error`
  });
