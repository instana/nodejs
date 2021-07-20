/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

/** @type {*} */
let parentLogger = null;
/** @type {*} */
const registry = {};

/**
 * @typedef {Object} GenericLogger
 * @property {(...args: *) => void} debug
 * @property {(...args: *) => void} info
 * @property {(...args: *) => void} warn
 * @property {(...args: *) => void} error
 * @property {*} [child]
 */

/** @type {GenericLogger} */
const consoleLogger = {
  /* eslint-disable no-console */
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error
  /* eslint-enable no-console */
};

/**
 * @typedef {Object} LoggerConfig
 * @property {*} [logger]
 */

/**
 * @param {LoggerConfig} config
 */
exports.init = function init(config = {}) {
  if (
    config.logger &&
    typeof config.logger.child === 'function' &&
    config.logger.fields &&
    config.logger.fields.__in === 1
  ) {
    // A logger has been provided via config and it has been created by an Instana module (@instana/collector).
    // We use it as is.
    parentLogger = config.logger;
  } else if (config.logger && typeof config.logger.child === 'function') {
    // A bunyan or pino logger has been provided via config. In either case we create a child logger directly under the
    // given logger which serves as the parent for all loggers we create later on.
    parentLogger = config.logger.child({
      module: '@instana/core',
      __in: 1
    });
  } else if (config.logger && hasLoggingFunctions(config.logger)) {
    // A custom logger which is neither bunyan nor pino has been provided via config. We use it as is.
    parentLogger = config.logger;
  } else {
    // No custom logger has been provided via config, we create a new minimal logger.
    parentLogger = consoleLogger;
  }

  Object.keys(registry).forEach(loggerName => {
    const reInitFn = registry[loggerName];
    reInitFn(exports.getLogger(loggerName));
  });
};

/**
 * @param {string} loggerName
 * @param {(arg: *) => *} [reInitFn]
 * @returns {GenericLogger}
 */
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
    // Unknown logger type (neither pino nor bunyan), we simply return the user provided custom logger as-is.
    logger = parentLogger;
  }

  if (reInitFn) {
    registry[loggerName] = reInitFn;
  }

  return logger;
};

/**
 * @param {GenericLogger} logger
 * @returns {boolean}
 */
function hasLoggingFunctions(logger) {
  return (
    typeof logger.debug === 'function' &&
    typeof logger.info === 'function' &&
    typeof logger.warn === 'function' &&
    typeof logger.error === 'function'
  );
}
