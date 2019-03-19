/* eslint-env mocha */
/* global Promise */

'use strict';

var fork = require('child_process').fork;
var request = require('request-promise');
var _ = require('lodash');

var agentPort = require('../apps/agentStubControls').agentPort;
var config = require('../config');
var utils = require('../utils');

var AbstractControls = (module.exports = function AbstractControls(opts) {
  // absolute path to .js file that should be executed
  this.appPath = opts.appPath;
  this.port = opts.port || process.env.APP_PORT || 3215;
  this.tracingEnabled = opts.tracingEnabled !== false;
  this.useHttps = opts.env && !!opts.env.USE_HTTPS;
  this.baseUrl = (this.useHttps ? 'https' : 'http') + '://127.0.0.1:' + this.port;
  // optional agent controls which will result in a beforeEach call which ensures that the
  // sensor is successfully connected to the agent.
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
  beforeEach(
    function() {
      var that = this;
      this.receivedIpcMessages = [];

      this.process = fork(this.appPath, {
        stdio: config.getAppStdio(),
        env: this.env
      });

      this.process.on('message', function(message) {
        that.receivedIpcMessages.push(message);
      });
      return this.waitUntilServerIsUp();
    }.bind(this)
  );

  if (this.agentControls) {
    beforeEach(
      function() {
        return this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid());
      }.bind(this)
    );
  }

  afterEach(this.kill.bind(this));
};

AbstractControls.prototype.kill = function kill() {
  if (this.process.killed || this.dontKillInAfterHook) {
    return Promise.resolve();
  }
  return new Promise(
    function(resolve) {
      this.process.once('exit', resolve);
      this.process.kill();
    }.bind(this)
  );
};

AbstractControls.prototype.waitUntilServerIsUp = function waitUntilServerIsUp() {
  return utils.retry(
    function() {
      return request({
        method: 'GET',
        url: this.baseUrl,
        headers: {
          'X-INSTANA-L': '0'
        },
        strictSSL: false
      });
    }.bind(this)
  );
};

AbstractControls.prototype.getPid = function getPid() {
  return this.process.pid;
};

AbstractControls.prototype.sendRequest = function(opts) {
  var headers = opts.headers || {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: this.baseUrl + opts.path,
    json: true,
    body: opts.body,
    headers: headers,
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
