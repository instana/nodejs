/* eslint-env mocha */

'use strict';

var spawn = require('child_process').spawn;
var Promise = require('bluebird');
var path = require('path');

var config = require('../../../config');
var agentPort = require('../../../apps/agentStubControls').agentPort;

var app;

exports.registerTestHooks = function(opts) {
  beforeEach(function() {
    opts = opts || {};

    var env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.CONSUMER_TYPE = opts.consumerType;

    app = spawn('node', [path.join(__dirname, 'consumer.js')], {
      stdio: config.getAppStdio(),
      env: env
    });

    return Promise.delay(1500);
  });

  afterEach(function() {
    app.kill();
  });
};

exports.getPid = function() {
  return app.pid;
};
