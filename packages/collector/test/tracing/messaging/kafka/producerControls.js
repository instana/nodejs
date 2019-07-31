/* eslint-env mocha */

'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../utils');
const config = require('../../../config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const appPort = (exports.appPort = 3216);

let app;

exports.registerTestHooks = opts => {
  beforeEach(() => {
    opts = opts || {};

    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.PRODUCER_TYPE = opts.producerType;

    app = spawn('node', [path.join(__dirname, 'producer.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    app.kill();
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

exports.getPid = () => app.pid;

exports.send = (key, message) =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${appPort}/send-message`,
    json: true,
    simple: true,
    body: {
      key,
      message
    }
  });
