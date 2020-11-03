'use strict';

const _ = require('lodash');
const fork = require('child_process').fork;
const fs = require('fs');
const path = require('path');
const request = require('request-promise');

const agentPort = require('../apps/agentStubControls').agentPort;
const config = require('../../../core/test/config');
const http2Promise = require('./http2Promise');
const testUtils = require('../../../core/test/test_util');

const sslDir = path.join(__dirname, '..', 'apps', 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

const ProcessControls = (module.exports = function ProcessControls(opts = {}) {
  if (!opts.appPath && !opts.dirname) {
    throw new Error('Missing mandatory config option, either appPath or dirname needs to be provided.');
  }
  if (opts.appPath && opts.dirname) {
    throw new Error('Invalid config, appPath and dirname are mutually exclusive.');
  }
  if (!opts.appPath && opts.dirname) {
    opts.appPath = path.join(opts.dirname, 'app');
  }

  // absolute path to .js file that should be executed
  this.appPath = opts.appPath;
  this.dontKillInAfterHook = opts.dontKillInAfterHook;
  this.args = opts.args;
  this.http2 = opts.http2;
  this.port = opts.port || process.env.APP_PORT || 3215;
  this.useHttps = opts.env && !!opts.env.USE_HTTPS;
  this.baseUrl = `${this.useHttps || this.http2 ? 'https' : 'http'}://localhost:${this.port}`;
  this.tracingEnabled = opts.tracingEnabled !== false;
  this.usePreInit = opts.usePreInit === true;
  // optional agent controls which will result in a beforeEach call which ensures that the
  // collector is successfully connected to the agent.
  this.agentControls = opts.agentControls;
  this.env = _.assign(
    {},
    process.env,
    {
      APP_PORT: this.port,
      INSTANA_AGENT_PORT: agentPort,
      INSTANA_LOG_LEVEL: 'warn',
      INSTANA_DISABLE_TRACING: !this.tracingEnabled,
      INSTANA_FORCE_TRANSMISSION_STARTING_AT: '1',
      INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS: opts.minimalDelay != null ? opts.minimalDelay : 0
    },
    opts.env
  );
  if (this.usePreInit) {
    this.env.INSTANA_EARLY_INSTRUMENTATION = 'true';
  }
  this.receivedIpcMessages = [];
});

ProcessControls.prototype.registerTestHooks = function registerTestHooks(retryTime) {
  beforeEach(() => {
    const that = this;
    this.receivedIpcMessages = [];

    const forkConfig = {
      stdio: config.getAppStdio(),
      env: this.env
    };

    this.process = this.args ? fork(this.appPath, this.args, forkConfig) : fork(this.appPath, forkConfig);

    this.process.on('message', message => {
      that.receivedIpcMessages.push(message);
    });
    return this.waitUntilServerIsUp(retryTime);
  });

  if (this.agentControls) {
    beforeEach(() => this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid()));
  }

  afterEach(this.kill.bind(this));

  return this;
};

ProcessControls.prototype.kill = function kill() {
  if (this.process.killed || this.dontKillInAfterHook) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    this.process.once('exit', resolve);
    this.process.kill();
  });
};

ProcessControls.prototype.waitUntilServerIsUp = function waitUntilServerIsUp(retryTime) {
  return testUtils.retry(
    () =>
      this.sendRequest({
        method: 'GET',
        suppressTracing: true
      }),
    retryTime
  );
};

ProcessControls.prototype.getPid = function getPid() {
  if (!this.process) {
    return 'no process, no PID';
  }
  return this.process.pid;
};

ProcessControls.prototype.sendRequest = function(opts) {
  const requestOptions = Object.assign({}, opts);
  requestOptions.baseUrl = this.baseUrl;
  if (this.http2) {
    return http2Promise.request(requestOptions);
  } else {
    if (opts.suppressTracing === true) {
      opts.headers = opts.headers || {};
      opts.headers['X-INSTANA-L'] = '0';
    }

    opts.url = this.baseUrl + (opts.path || '');
    opts.json = true;
    opts.ca = cert;

    return request(opts);
  }
};

ProcessControls.prototype.sendViaIpc = function(message) {
  this.process.send(message);
};

ProcessControls.prototype.getIpcMessages = function() {
  return this.receivedIpcMessages;
};

module.exports = ProcessControls;
