/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const path = require('path');
const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');
const agentPort = require('../../../globalAgent').instance.agentPort;

let app;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.AMQPLIB_VERSION = opts.version;
    env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS = 100;

    app = spawn('node', [path.join(__dirname, `consumer${opts.apiType}.js`)], {
      stdio: config.getAppStdio(),
      env
    });

    app.on('message', message => {
      if (message === 'instana.collector.initialized') {
        app.collectorInitialized = true;
      } else if (message === 'amqp.initialized') {
        app.amqpInitialized = true;
      }
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    app.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(() => {
    if (!app.collectorInitialized) throw new Error('Collector not fullly initialized.');
    if (!app.amqpInitialized) throw new Error('amqp not ready.');
  });
}

exports.getPid = () => app.pid;
