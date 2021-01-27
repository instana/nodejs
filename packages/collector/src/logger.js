/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable dot-notation */

'use strict';

const bunyan = require('bunyan');
const instanaNodeJsCore = require('@instana/core');

const bunyanToAgentStream = require('./agent/bunyanToAgentStream');

let parentLogger = null;
const registry = {};

exports.init = function init(config, isReInit) {
  if (config.logger && typeof config.logger.child === 'function') {
    // A bunyan or pino logger has been provided via config. In either case we create a child logger directly under the
    // given logger which serves as the parent for all loggers we create later on.
    parentLogger = config.logger.child({
      module: 'instana-nodejs-logger-parent',
      __in: 1
    });
  } else if (config.logger && hasLoggingFunctions(config.logger)) {
    // A custom non-bunyan logger has been provided via config. We use it as is.
    parentLogger = config.logger;
  } else {
    // No custom logger has been provided via config, we create a new bunyan logger as the parent logger for all loggers
    // we create later on.
    parentLogger = bunyan.createLogger({
      name: '@instana/collector',
      __in: 1
    });
  }

  if (isBunyan(parentLogger)) {
    // in case we are using a bunyan logger we also forward logs to the agent
    parentLogger.addStream({
      type: 'raw',
      stream: bunyanToAgentStream,
      level: 'info'
    });
    if (process.env['INSTANA_DEBUG']) {
      parentLogger.level('debug');
    } else if (config.level) {
      parentLogger.level(config.level);
    } else if (process.env['INSTANA_LOG_LEVEL']) {
      parentLogger.level(process.env['INSTANA_LOG_LEVEL'].toLowerCase());
    }
  }

  if (isReInit) {
    Object.keys(registry).forEach(loggerName => {
      const reInitFn = registry[loggerName];
      reInitFn(exports.getLogger(loggerName));
    });
    // cascade re-init to @instana/core
    instanaNodeJsCore.logger.init(config);
  }
};

exports.getLogger = function getLogger(loggerName, reInitFn) {
  if (!parentLogger) {
    exports.init({});
  }

  let logger;

  if (typeof parentLogger.child === 'function') {
    // Either bunyan or pino, both support parent-child relationships between loggers.
    logger = parentLogger.child({
      module: loggerName
    });
  } else {
    // Unknown logger type (neither bunyan nor pino), we simply return the user provided custom logger as-is.
    logger = parentLogger;
  }

  if (reInitFn) {
    registry[loggerName] = reInitFn;
  }
  return logger;
};

function isBunyan(logger) {
  return logger instanceof bunyan;
}

function hasLoggingFunctions(logger) {
  return (
    typeof logger.debug === 'function' &&
    typeof logger.info === 'function' &&
    typeof logger.warn === 'function' &&
    typeof logger.error === 'function'
  );
}
