/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const instanaNodeJsCore = require('@instana/core');
const instanaSharedMetrics = require('@instana/shared-metrics');

require('./tracing'); // load additional instrumentations
const log = require('./logger');
const normalizeConfig = require('./util/normalizeConfig');
const experimental = require('./experimental');

let agentConnection;

let config;

module.exports = exports = function init(_config) {
  config = normalizeConfig(_config);

  log.init(config, false);

  agentConnection = require('./agentConnection');
  const agentOpts = require('./agent/opts');
  const pidStore = require('./pidStore');
  const uncaught = require('./uncaught');

  let logger;
  logger = log.getLogger('index', newLogger => {
    logger = newLogger;
  });
  if (!config.logger) {
    config.logger = logger;
  }

  agentOpts.init(config);
  instanaNodeJsCore.init(config, agentConnection, pidStore);
  instanaSharedMetrics.setLogger(logger);
  uncaught.init(config, agentConnection, pidStore);
  require('./metrics').init(config);

  logger.info('@instana/collector module version:', require(path.join(__dirname, '..', 'package.json')).version);
  require('./announceCycle').start();
  return exports;
};

exports.currentSpan = function getHandleForCurrentSpan() {
  return instanaNodeJsCore.tracing.getHandleForCurrentSpan();
};

exports.isTracing = function isTracing() {
  return instanaNodeJsCore.tracing.getCls() ? instanaNodeJsCore.tracing.getCls().isTracing() : false;
};

exports.isConnected = function isConnected() {
  return agentConnection && agentConnection.isConnected();
};

exports.setLogger = function setLogger(logger) {
  config.logger = logger;
  log.init(config, true);
};

exports.core = instanaNodeJsCore;
exports.sharedMetrics = instanaSharedMetrics;
exports.experimental = experimental;
exports.opentracing = instanaNodeJsCore.tracing.opentracing;
exports.sdk = instanaNodeJsCore.tracing.sdk;

if (process.env.INSTANA_IMMEDIATE_INIT != null && process.env.INSTANA_IMMEDIATE_INIT.toLowerCase() === 'true') {
  module.exports();
} else if (
  process.env.INSTANA_EARLY_INSTRUMENTATION != null &&
  process.env.INSTANA_EARLY_INSTRUMENTATION.toLowerCase() === 'true'
) {
  instanaNodeJsCore.preInit();
}
