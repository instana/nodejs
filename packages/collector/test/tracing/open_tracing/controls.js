/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;

const path = require('path');
const portfinder = require('../../test_util/portfinder');
const testUtils = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const agentControls = require('../../globalAgent').instance;

let expressOpentracingApp;
let appPort;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentControls.getPort();
    env.APP_PORT = portfinder();
    appPort = env.APP_PORT;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.DISABLE_AUTOMATIC_TRACING = opts.automaticTracingEnabled === false;
    // By default, we test without OpenTelemetry instrumentation enabled
    // because the test setup is currently broken and not capturing OTEL spans.
    // TODO: INSTA-62539
    env.INSTANA_DISABLE_USE_OPENTELEMETRY = opts.enableOtelIntegration ? 'false' : 'true';

    expressOpentracingApp = spawn('node', [path.join(__dirname, 'app.js')], {
      stdio: config.getAppStdio(),
      env
    });

    expressOpentracingApp.on('message', message => {
      if (message === 'instana.collector.initialized') {
        expressOpentracingApp.collectorInitialized = true;
      }
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    expressOpentracingApp.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(async () => {
    await fetch(`http://127.0.0.1:${appPort}`, {
      method: 'GET',
      url: `http://127.0.0.1:${appPort}`,
      headers: {
        'X-INSTANA-L': '0'
      }
    });

    if (!expressOpentracingApp.collectorInitialized) throw new Error('Collector not fullly initialized.');
  });
}

exports.getPid = () => expressOpentracingApp.pid;

exports.sendRequest = opts =>
  fetch(`http://127.0.0.1:${appPort}${opts.path}`, {
    method: opts.method,
    url: `http://127.0.0.1:${appPort}${opts.path}`
  }).then(response => response.text());
