/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable no-console */

'use strict';

// 30 = info
let minLevel = 30;

const DEBUG_LEVEL = 20;

const consoleLogger = {
  debug: createLogFn(20, console.debug || console.log),
  info: createLogFn(30, console.log),
  warn: createLogFn(40, console.warn),
  error: createLogFn(50, console.error)
};

let instanaServerlessLogger;

function createLogFn(level, fn) {
  return function log() {
    if (level >= minLevel) {
      fn.apply(console, arguments);
    }
  };
}

class InstanaServerlessLogger {
  /**
   * @param {import('@instana/core/src/core').GenericLogger} logger
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * @param {import('@instana/core/src/core').GenericLogger} _logger
   */
  setLogger(_logger) {
    this.logger = _logger;
  }

  isInDebugMode() {
    if (!this.logger) return false;

    if (typeof this.logger.level === 'function') {
      return this.logger.level() === DEBUG_LEVEL;
    }

    if (typeof this.logger.level === 'number') {
      return this.logger.level === DEBUG_LEVEL;
    }

    if (typeof this.logger.getLevel === 'function') {
      return this.logger.getLevel() === DEBUG_LEVEL;
    }

    return minLevel === DEBUG_LEVEL;
  }

  warn = (...args) => this.logger?.warn?.(...args);

  error = (...args) => this.logger?.error?.(...args);

  info = (...args) => this.logger?.info?.(...args);

  debug = (...args) => this.logger?.debug?.(...args);

  trace = (...args) => this.logger?.trace?.(...args);
}

/**
 * @param {import('@instana/core/src/instanaCtr').InstanaCtrType} [_instanaCtr]
 */
// eslint-disable-next-line no-unused-vars
exports.init = _instanaCtr => {};

exports.create = customConfig => {
  let parentLogger;

  // CASE: prevent circular references. This is our own logger.
  if (customConfig.logger && customConfig.logger instanceof InstanaServerlessLogger && customConfig.logger.logger) {
    customConfig.logger = customConfig.logger.logger;
  }

  // CASE: customer overrides logger in serverless land.
  if (customConfig.logger && typeof customConfig.logger.child === 'function') {
    // A bunyan or pino logger has been provided via config. In either case we create a child logger directly under the
    // given logger which serves as the parent for all loggers we create later on.

    // BUG: Winston does not support child logger levels! Neither in `.child` nor with `level()`
    //      Setting INSTANA_DEBUG=true has no affect in the child winston logger.
    //      It takes the parent logger level.
    parentLogger = customConfig.logger.child({
      module: 'instana-nodejs-serverless-logger'
    });
  } else if (customConfig.logger && hasLoggingFunctions(customConfig.logger)) {
    // A custom non-bunyan/non-pino logger has been provided via config. We use it as is.
    parentLogger = customConfig.logger;
  } else {
    parentLogger = consoleLogger;
  }

  // NOTE: We accept for `process.env.INSTANA_DEBUG` any string value - does not have to be "true".
  if (process.env.INSTANA_DEBUG || customConfig.level || process.env.INSTANA_LOG_LEVEL) {
    setLoggerLevel(process.env.INSTANA_DEBUG ? 'debug' : customConfig.level || process.env.INSTANA_LOG_LEVEL);
  }

  if (!instanaServerlessLogger) {
    instanaServerlessLogger = new InstanaServerlessLogger(parentLogger);
  } else {
    instanaServerlessLogger.setLogger(parentLogger);
  }

  return instanaServerlessLogger;
};

exports.getLogger = () => {
  return instanaServerlessLogger;
};

// TODO: Legacy. Remove in next major release.
['info', 'warn', 'error', 'debug'].forEach(level => {
  exports[level] = function () {
    if (!instanaServerlessLogger) {
      exports.init();
    }

    return instanaServerlessLogger[level].apply(instanaServerlessLogger, arguments);
  };
});

// TODO: Legacy. Remove in next major release.
exports.setLevel = setLoggerLevel;

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

function setLoggerLevel(level) {
  // eslint-disable-next-line yoda
  if (typeof level === 'number' && 0 < level && level <= 50) {
    minLevel = level;
    return;
  }

  if (typeof level === 'string') {
    switch (level) {
      case 'debug':
        minLevel = 20;
        break;
      case 'info':
        minLevel = 30;
        break;
      case 'warn':
        minLevel = 40;
        break;
      case 'error':
        minLevel = 50;
        break;
      default:
        break;
    }
  }
}
