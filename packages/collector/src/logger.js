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

const uninstrumentedLogger = require('./uninstrumentedLogger');

const { logger } = require('@instana/core');
const loggerToAgentStream = require('./agent/loggerToAgentStream');

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

    // BUG: Winston does not support child logger levels!
    //      Neither in `.child(...)` nor with `level(...)`.
    //      Setting INSTANA_DEBUG=true has no affect in the child winston logger.
    //      It takes the parent logger level.
    //      We cannot fix this in our side.
    //      https://github.com/winstonjs/winston/issues/1854#issuecomment-710195110
    parentLogger = config.logger.child({
      module: 'instana-nodejs-logger-parent',
      __instana: 1
    });
  } else if (config.logger && hasLoggingFunctions(config.logger)) {
    // A custom non-bunyan/non-pino logger has been provided via config. We use it as is.
    // The __instana attribute identifies the Instana logger, distinguishing it from the client application logger,
    // and also prevents these logs from being traced
    // This setPropertyOf syntax preserves the properties and prototypes of config.logger
    parentLogger = Object.setPrototypeOf({ ...config.logger, __instana: 1 }, Object.getPrototypeOf(config.logger));
  } else {
    // No custom logger has been provided via config, we create a new pino logger as the parent logger for all loggers
    // we create later on.
    parentLogger = uninstrumentedLogger({
      name: '@instana/collector',
      level: 'info'
    });
  }

  // Passing the log stream to agentStream for Debugging purposes
  // TODO: consider adding winston and other major loggers also for this
  if (isPinoLogger(parentLogger)) {
    // This consoleStream creates a destination stream for the logger that writes log data to the standard output.
    // Since we are using multistream here, this needs to be specified explicitly

    try {
      const consoleStream = uninstrumentedLogger.destination(parentLogger.destination);
      const multiStream = {
        /**
         * Custom write method to send logs to multiple destinations
         * @param {string} chunk
         */
        write(chunk) {
          consoleStream.write(chunk);
          loggerToAgentStream.write(chunk);
        }
      };

      parentLogger = uninstrumentedLogger(
        {
          ...parentLogger.levels,
          level: parentLogger.level || 'info',
          base: parentLogger.bindings(),
          timestamp: () => `,"time":"${new Date().toISOString()}"`
        },
        multiStream
      );
    } catch (error) {
      parentLogger.debug(`An issue occurred while modifying the current logger: ${error.message}`);
    }
  } else if (parentLogger && parentLogger.addStream) {
    // in case we are using a bunyan logger we also forward logs to the agent
    parentLogger.addStream({
      type: 'raw',
      stream: loggerToAgentStream,
      level: 'info'
    });
  }

  if (process.env['INSTANA_DEBUG']) {
    setLoggerLevel(parentLogger, 'debug');
  } else if (config.level) {
    setLoggerLevel(parentLogger, config.level);
  } else if (process.env['INSTANA_LOG_LEVEL']) {
    setLoggerLevel(parentLogger, process.env['INSTANA_LOG_LEVEL'].toLowerCase());
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
 * @param {string|null} [level] - Optional log level
 * @returns {import('@instana/core/src/core').GenericLogger}
 */
exports.getLogger = function getLogger(loggerName, reInitFn, level) {
  if (!parentLogger) {
    exports.init({});
  }

  let _logger;

  if (typeof parentLogger.child === 'function') {
    // Either bunyan or pino, both support parent-child relationships between loggers.
    _logger = parentLogger.child({
      module: loggerName,
      threadId
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

  if (level) {
    setLoggerLevel(_logger, level);
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

/**
 * @param {import("@instana/core/src/core").GenericLogger} _logger
 * @param {string|number} level
 *
 * Bunyan uses `level()` function to set the log level.
 * https://www.npmjs.com/package/bunyan#levels
 *
 * Pino uses `level = LEVEL`.
 * https://github.com/pinojs/pino/blob/main/docs/api.md#logger-level
 *
 * As far as I could figure out, Winston uses `level = LEVEL` or
 * `transports.console.level = 'info';`
 *
 * I could not figure out who uses `setLevel`.
 */
function setLoggerLevel(_logger, level) {
  if (typeof _logger.setLevel === 'function') {
    _logger.setLevel(level);
  } else if (typeof _logger.level === 'function') {
    _logger.level(level);
  } else {
    _logger.level = level;
  }
}

/**
 * @param {*} _logger
 * @returns {boolean}
 */
function isPinoLogger(_logger) {
  return (
    _logger &&
    typeof _logger === 'object' &&
    typeof _logger.child === 'function' &&
    typeof _logger.level === 'string' &&
    typeof _logger.bindings === 'function'
  );
}
