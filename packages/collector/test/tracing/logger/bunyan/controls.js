/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');
const portfinder = require('../../../test_util/portfinder');

const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');

const upstreamPort = require('../../../apps/expressControls').appPort;
const agentPort = require('../../../globalAgent').instance.agentPort;

let appProcess;
const appPort = (exports.appPort = portfinder());

exports.registerTestHooks = (opts = {}) => {
  let appName = 'app.js';
  if (opts.instanaLoggingMode) {
    switch (opts.instanaLoggingMode) {
      case 'instana-creates-bunyan-logger':
        appName = 'app-instana-creates-bunyan-logger.js';
        break;
      case 'instana-receives-bunyan-logger':
        appName = 'app-instana-receives-bunyan-logger.js';
        break;
      case 'instana-receives-non-bunyan-logger':
        appName = 'app-instana-receives-non-bunyan-logger.js';
        break;
      default:
        throw new Error(`Unknown instanaLoggingMode: ${opts.instanaLoggingMode}`);
    }
  }
  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    appProcess = spawn('node', [path.join(__dirname, appName)], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    appProcess.kill();
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

exports.getPid = () => appProcess.pid;

exports.trigger = (level, headers = {}) => request(`http://127.0.0.1:${appPort}/${level}`, { headers });
