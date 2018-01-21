/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var request = require('request-promise');
var _ = require('lodash');

var agentPort = require('../apps/agentStubControls').agentPort;
var config = require('../config');
var utils = require('../utils');

var AbstractControls = module.exports = function AbstractControls(opts) {
  // absolute path to .js file that should be executed
  this.appPath = opts.appPath;
  this.port = opts.port || process.env.APP_PORT || 3215;
  this.baseUrl = 'http://127.0.0.1:' + this.port;
  // optional agent controls which will result in a beforeEach call which ensures that the
  // sensor is successfully connected to the agent.
  this.agentControls = opts.agentControls;
  this.env = _.assign({}, process.env, {
    APP_PORT: this.port,
    AGENT_PORT: agentPort
  }, opts.env);
};


AbstractControls.prototype.registerTestHooks = function registerTestHooks() {
  beforeEach(function() {
    this.process = spawn('node', [this.appPath], {
      stdio: config.getAppStdio(),
      env: this.env
    });

    return this.waitUntilServerIsUp();
  }.bind(this));

  if (this.agentControls) {
    beforeEach(function() {
      return this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid());
    }.bind(this));
  }

  afterEach(function() {
    this.process.kill();
  }.bind(this));
};


AbstractControls.prototype.waitUntilServerIsUp = function waitUntilServerIsUp() {
  return utils.retry(function() {
    return request({
      method: 'GET',
      url: this.baseUrl,
      headers: {
        'X-INSTANA-L': '0'
      }
    });
  }.bind(this));
};


AbstractControls.prototype.getPid = function getPid() {
  return this.process.pid;
};


AbstractControls.prototype.sendRequest = function(opts) {
  var headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: this.baseUrl + opts.path,
    json: true,
    body: opts.body,
    headers: headers,
    qs: opts.qs
  });
};
