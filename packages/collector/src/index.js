'use strict';

var path = require('path');
var instanaNodeJsCore = require('@instana/core');

var log = require('./logger');
var normalizeConfig = require('./util/normalizeConfig');

var config;

module.exports = exports = function init(_config) {
  config = normalizeConfig(_config);

  log.init(config, false);

  var agentConnection = require('./agentConnection');
  var agentOpts = require('./agent/opts');
  var pidStore = require('./pidStore');
  var uncaught = require('./uncaught');

  var logger;
  logger = log.getLogger('index', function(newLogger) {
    logger = newLogger;
  });
  if (!config.logger) {
    config.logger = logger;
  }

  agentOpts.init(config);
  instanaNodeJsCore.init(config, agentConnection, pidStore);
  uncaught.init(config, agentConnection, pidStore);
  require('./metrics').init(config);
  require('./actions/profiling/cpu').init(config);

  logger.info('@instana/collector module version:', require(path.join(__dirname, '..', 'package.json')).version);
  require('./announceCycle').start();
  return exports;
};

exports.opentracing = instanaNodeJsCore.tracing.opentracing;

exports.currentSpan = function getHandleForCurrentSpan() {
  return instanaNodeJsCore.tracing.getHandleForCurrentSpan();
};

exports.sdk = instanaNodeJsCore.tracing.sdk;

exports.setLogger = function(logger) {
  config.logger = logger;
  log.init(config, true);
};
