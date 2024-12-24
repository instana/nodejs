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

const { uninstrumentedLogger: pinoCopy } = require('@instana/core');

const pino = pinoCopy;

const { logger } = require('@instana/core');
const pinoToAgentStream = require('./agent/loggerToAgentStream');

/** @type {import('@instana/core/src/core').GenericLogger} */
let parentLogger = null;
/** @type {Object.<string, (logger: import('@instana/core/src/core').GenericLogger) => *>} */
const registry = {};

/**
 * @param {import('./types/collector').CollectorConfig} config
 * @param {boolean} [isReInit]
 */
exports.init = function init(config, isReInit) {
  if (config.logger && typeof config.logger.child === 'function') {
    // A bunyan or pino logger has been provided via config. In either case we create a child logger directly under the
    // given logger which serves as the parent for all loggers we create later on.
    parentLogger = config.logger.child({
      module: 'instana-nodejs-logger-parent'
    });
  } else if (config.logger && hasLoggingFunctions(config.logger)) {
    // A custom non-bunyan/non-pino logger has been provided via config. We use it as is.
    parentLogger = config.logger;
  } else {
    // This consoleStream creates a destination stream for the Pino logger that writes log data to the standard output.
    // Since we are using multistream here, this needs to be specified explicitly
    const consoleStream = pino.destination(process.stdout);

    const multiStream = {
      /**
       * Custom write method to send logs to multiple destinations
       * @param {string} chunk
       */
      write(chunk) {
        consoleStream.write(chunk);

        const logRecord = JSON.parse(chunk);
        pinoToAgentStream.write(logRecord);
      }
    };

    // No custom logger has been provided via config, we create a new pino logger as the parent logger for all loggers
    // we create later on.
    parentLogger = pino(
      {
        name: '@instana/collector',
        thread: threadId,
        level: 'info'
      },
      multiStream
    );

    if (process.env['INSTANA_DEBUG']) {
      parentLogger.level = 'debug';
    } else if (config.level) {
      parentLogger.level = config.level;
    } else if (process.env['INSTANA_LOG_LEVEL']) {
      parentLogger.level = process.env['INSTANA_LOG_LEVEL'].toLowerCase();
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
 * @param {(logger: import('@instana/core/src/core').GenericLogger) => *} [reInitFn]
 * @returns {import('@instana/core/src/core').GenericLogger}
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
    if (registry[loggerName]) {
      throw new Error(`Duplicate logger name: ${loggerName}.`);
    }
    registry[loggerName] = reInitFn;
  }

  return /** @type {import('@instana/core/src/core').GenericLogger} */ (_logger);
};

/**
 * @param {import('@instana/core/src/core').GenericLogger | *} _logger
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
