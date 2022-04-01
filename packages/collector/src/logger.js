/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable dot-notation */

'use strict';

/** @type number */
let threadId = 0;
try {
  threadId = require('worker_threads').threadId;
} catch (ignored) {
  // We are apparently running in a Node.js version that does not have worker threads yet, thus we are on the main
  // thread (0).
}

const bunyan = require('bunyan');
const { logger } = require('@instana/core');

const bunyanToAgentStream = require('./agent/bunyanToAgentStream');

/** @type {bunyan | import('@instana/core/src/logger').GenericLogger} */
let parentLogger = null;
/** @type {Object.<string, (logger: import('@instana/core/src/logger').GenericLogger) => *>} */
const registry = {};

/**
 * @param {import('./util/normalizeConfig').CollectorConfig} config
 * @param {boolean} [isReInit]
 */
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
      thread: threadId,
      __in: 1
    });
  }

  if (isBunyan(parentLogger)) {
    // in case we are using a bunyan logger we also forward logs to the agent
    /** @type {bunyan} */ (parentLogger).addStream({
      type: 'raw',
      stream: bunyanToAgentStream,
      level: 'info'
    });
    if (process.env['INSTANA_DEBUG']) {
      /** @type {bunyan} */ (parentLogger).level('debug');
    } else if (config.level) {
      /** @type {bunyan} */ (parentLogger).level(/** @type {import('bunyan').LogLevel} */ (config.level));
    } else if (process.env['INSTANA_LOG_LEVEL']) {
      /** @type {bunyan} */ (parentLogger).level(
        /** @type {import('bunyan').LogLevel} */ (process.env['INSTANA_LOG_LEVEL'].toLowerCase())
      );
    }
  }

  if (isReInit) {
    Object.keys(registry).forEach(loggerName => {
      const reInitFn = registry[loggerName];
      reInitFn(exports.getLogger(loggerName));
    });
    // cascade re-init to @instana/core
    logger.init(config);
  }
};

/**
 * @param {string} loggerName
 * @param {(logger: import('@instana/core/src/logger').GenericLogger) => *} [reInitFn]
 * @returns {import('@instana/core/src/logger').GenericLogger}
 */
exports.getLogger = function getLogger(loggerName, reInitFn) {
  if (!parentLogger) {
    exports.init({});
  }

  let _logger;

  if (typeof parentLogger.child === 'function') {
    // Either bunyan or pino, both support parent-child relationships between loggers.
    _logger = parentLogger.child({
      module: loggerName
    });
  } else {
    // Unknown logger type (neither bunyan nor pino), we simply return the user provided custom logger as-is.
    _logger = parentLogger;
  }

  if (reInitFn) {
    registry[loggerName] = reInitFn;
  }
  return _logger;
};

/**
 * @param {import('bunyan') | *} _logger
 * @returns {boolean}
 */
function isBunyan(_logger) {
  return _logger instanceof bunyan;
}

/**
 * @param {import('@instana/core/src/logger').GenericLogger | *} _logger
 * @returns {boolean}
 */
function hasLoggingFunctions(_logger) {
  return (
    typeof _logger.debug === 'function' &&
    typeof _logger.info === 'function' &&
    typeof _logger.warn === 'function' &&
    typeof _logger.error === 'function'
  );
}
