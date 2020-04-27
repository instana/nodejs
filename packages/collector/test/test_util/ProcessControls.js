'use strict';

const path = require('path');
const fork = require('child_process').fork;
const request = require('request-promise');
const _ = require('lodash');

const agentPort = require('../apps/agentStubControls').agentPort;
const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');

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
  this.args = opts.args;
  this.port = opts.port || process.env.APP_PORT || 3215;
  this.tracingEnabled = opts.tracingEnabled !== false;
  this.dontKillInAfterHook = opts.dontKillInAfterHook;
  this.useHttps = opts.env && !!opts.env.USE_HTTPS;
  this.usePreInit = opts.usePreInit === true;
  this.baseUrl = `${this.useHttps ? 'https' : 'http'}://127.0.0.1:${this.port}`;
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

ProcessControls.prototype.registerTestHooks = function registerTestHooks() {
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
    return this.waitUntilServerIsUp();
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

ProcessControls.prototype.waitUntilServerIsUp = function waitUntilServerIsUp() {
  return testUtils.retry(() => {
    return request({
      method: 'GET',
      url: this.baseUrl,
      headers: {
        'X-INSTANA-L': '0'
      },
      strictSSL: false
    });
  });
};

ProcessControls.prototype.getPid = function getPid() {
  if (!this.process) {
    return 'no process, no PID';
  }
  return this.process.pid;
};

ProcessControls.prototype.sendRequest = function(opts) {
  if (opts.suppressTracing === true) {
    opts.headers = opts.headers || {};
    opts.headers['X-INSTANA-L'] = '0';
  }

  opts.url = this.baseUrl + opts.path;
  opts.json = true;
  opts.strictSSL = false;
  return request(opts);
};

ProcessControls.prototype.sendViaIpc = function(message) {
  this.process.send(message);
};

ProcessControls.prototype.getIpcMessages = function() {
  return this.receivedIpcMessages;
};

module.exports = ProcessControls;
