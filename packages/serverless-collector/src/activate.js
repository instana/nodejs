/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

let logger = consoleLogger;

const config = normalizeConfig({});
config.logger = logger;

function init() {
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
    logger.setLevel(process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL);
  }

  // NOTE: This package will not collect metrics.
  // NOTE: This package does not support autotracing.

  try {
    identityProvider.init();
    backendConnector.init(identityProvider, logger, false, true, 950);
    instanaCore.init(config, backendConnector, identityProvider);
    tracing.activate();

    logger.debug('@instana/serverless-collector initialized.');

    // eslint-disable-next-line no-unused-expressions
    process.send && process.send('instana.serverless-collector.initialized');
  } catch (e) {
    logger.error('Initializing @instana/serverless-collector failed. This process will not be traced.', e);
  }
}

// NOTE: auto initialization is used because for all serverless environments
//       we recommend using the docker images. Therefor we need to auto initialize.
init();

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
  config.logger = logger;
  instanaCore.logger.init(config);
};

exports.opentracing = tracing.opentracing;
