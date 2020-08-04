'use strict';

const path = require('path');
const instanaNodeJsCore = require('@instana/core');

require('./tracing'); // load additional instrumentations
const log = require('./logger');
const normalizeConfig = require('./util/normalizeConfig');
const experimental = require('./experimental');

let config;

module.exports = exports = function init(_config) {
  config = normalizeConfig(_config);

  log.init(config, false);

  const agentConnection = require('./agentConnection');
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
  uncaught.init(config, agentConnection, pidStore);
  require('./metrics').init(config);

  logger.info('@instana/collector module version:', require(path.join(__dirname, '..', 'package.json')).version);
  require('./announceCycle').start();
  return exports;
};

exports.currentSpan = function getHandleForCurrentSpan() {
  return instanaNodeJsCore.tracing.getHandleForCurrentSpan();
};

exports.setLogger = function setLogger(logger) {
  config.logger = logger;
  log.init(config, true);
};

exports.core = instanaNodeJsCore;
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
