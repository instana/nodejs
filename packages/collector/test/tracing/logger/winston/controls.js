/* eslint-env mocha */

'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');

const utils = require('../../../utils');
const config = require('../../../config');
const agentPort = require('../../../apps/agentStubControls').agentPort;
const upstreamPort = require('../../../apps/expressControls').appPort;
const appPort = (exports.appPort = 3215);

let appProcess;

exports.registerTestHooks = opts => {
  opts = opts || {};
  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;

    appProcess = spawn('node', [path.join(__dirname, 'app.js')], {
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

exports.getPid = () => appProcess.pid;

exports.trigger = (level, useGlobalLogger, useLogFunction) => {
  let pathSegment;
  if (useGlobalLogger && useLogFunction) {
    pathSegment = `/global-log-${level}`;
  } else if (useGlobalLogger) {
    pathSegment = `/global-${level}`;
  } else if (useLogFunction) {
    pathSegment = `/log-${level}`;
  } else {
    pathSegment = `/${level}`;
  }
  return request(`http://127.0.0.1:${appPort}${pathSegment}`);
};
