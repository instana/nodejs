/* eslint-env mocha */
/* global Promise */

'use strict';

const fork = require('child_process').fork;
const request = require('request-promise');
const _ = require('lodash');

const agentPort = require('../apps/agentStubControls').agentPort;
const config = require('../config');
const utils = require('../utils');

const AbstractControls = (module.exports = function AbstractControls(opts = {}) {
  // absolute path to .js file that should be executed
  this.appPath = opts.appPath;
  this.port = opts.port || process.env.APP_PORT || 3215;
  this.tracingEnabled = opts.tracingEnabled !== false;
  this.useHttps = opts.env && !!opts.env.USE_HTTPS;
  this.baseUrl = `${this.useHttps ? 'https' : 'http'}://127.0.0.1:${this.port}`;
  // optional agent controls which will result in a beforeEach call which ensures that the
  // collector is successfully connected to the agent.
  this.agentControls = opts.agentControls;
  this.env = _.assign(
    {},
    process.env,
    {
      APP_PORT: this.port,
      AGENT_PORT: agentPort,
      TRACING_ENABLED: this.tracingEnabled
    },
    opts.env
  );
  this.receivedIpcMessages = [];
});

AbstractControls.prototype.registerTestHooks = function registerTestHooks() {
  beforeEach(() => {
    const that = this;
    this.receivedIpcMessages = [];

    this.process = fork(this.appPath, {
      stdio: config.getAppStdio(),
      env: this.env
    });

    this.process.on('message', message => {
      that.receivedIpcMessages.push(message);
    });
    return this.waitUntilServerIsUp();
  });

  if (this.agentControls) {
    beforeEach(() => this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid()));
  }

  afterEach(this.kill.bind(this));
};

AbstractControls.prototype.kill = function kill() {
  if (this.process.killed || this.dontKillInAfterHook) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    this.process.once('exit', resolve);
    this.process.kill();
  });
};

AbstractControls.prototype.waitUntilServerIsUp = function waitUntilServerIsUp() {
  return utils.retry(() =>
    request({
      method: 'GET',
      url: this.baseUrl,
      headers: {
        'X-INSTANA-L': '0'
      },
      strictSSL: false
    })
  );
};

AbstractControls.prototype.getPid = function getPid() {
  return this.process.pid;
};

AbstractControls.prototype.sendRequest = function(opts) {
  const headers = opts.headers || {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: this.baseUrl + opts.path,
    json: true,
    body: opts.body,
    headers,
    qs: opts.qs,
    simple: opts.simple,
    resolveWithFullResponse: opts.resolveWithFullResponse,
    strictSSL: false
  });
};

AbstractControls.prototype.sendViaIpc = function(message) {
  this.process.send(message);
};

AbstractControls.prototype.getIpcMessages = function() {
  return this.receivedIpcMessages;
};
