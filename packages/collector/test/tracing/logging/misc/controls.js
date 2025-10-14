/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const path = require('path');
const portfinder = require('../../../test_util/portfinder');

const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');

const expressControls = require('../../../apps/expressControls');
const agentControls = require('../../../globalAgent').instance;

let appProcess;
let appPort;

exports.registerTestHooks = (opts = {}) => {
  let appName = 'app.js';
  if (opts.instanaLoggingMode) {
    switch (opts.instanaLoggingMode) {
      case 'uses-default-logger':
        appName = 'app-uses-default-logger.js';
        break;
      case 'receives-pino-logger':
        appName = 'app-receives-pino-logger.js';
        break;
      case 'receives-custom-dummy-logger':
        appName = 'app-receives-custom-dummy-logger.js';
        break;
      case 'receives-bunyan-logger':
        appName = 'app-receives-bunyan-logger.js';
        break;
      case 'receives-winston-logger':
        appName = 'app-receives-winston-logger.js';
        break;
      case 'receives-log4js-logger':
        appName = 'app-receives-log4js-logger.js';
        break;
      default:
        throw new Error(`Unknown app: ${opts.instanaLoggingMode}`);
    }
  }

  beforeEach(async () => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentControls.getPort();
    env.APP_PORT = portfinder();
    appPort = env.APP_PORT;
    env.UPSTREAM_PORT = expressControls.getPort();
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS = 100;
    env.PINO_VERSION = opts.PINO_VERSION;

    appProcess = spawn('node', [path.join(__dirname, appName)], {
      stdio: config.getAppStdio(),
      env
    });

    appProcess.on('message', msg => {
      if (msg === 'instana.collector.initialized') {
        appProcess.collectorInitialized = true;
      }
    });

    await waitUntilServerIsUp();
  });

  afterEach(() => {
    appProcess.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(async () => {
    await fetch(`http://127.0.0.1:${appPort}`, {
      method: 'GET',
      headers: {
        'X-INSTANA-L': '0'
      }
    });

    if (!appProcess.collectorInitialized) throw new Error('Collector not fullly initialized.');
  });
}

exports.getPid = () => appProcess.pid;

exports.trigger = (level, headers = {}) => fetch(`http://127.0.0.1:${appPort}/${level}`, { headers });
