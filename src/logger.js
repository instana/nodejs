'use strict';

var bunyan = require('bunyan');

var bunyanToAgentStream = require('./agent/bunyanToAgentStream');

var parentLogger;

var registry = {};

exports.init = function(config) {
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
      name: 'instana-nodejs-sensor',
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
    if (config.level) {
      parentLogger.level(config.level);
    }
  }

  Object.keys(registry).forEach(function(loggerName) {
    var reInit = registry[loggerName];
    reInit(exports.getLogger(loggerName));
  });
};

exports.getLogger = function(loggerName, reInit) {
  if (!parentLogger) {
    exports.init({});
  }

  var logger;

  if (typeof parentLogger.child === 'function') {
    // Either bunyan or pino, both support parent-child relationships between loggers.
    logger = parentLogger.child({
      module: loggerName
    });
  } else {
    // Unknown logger type (neither bunyan nor pino), we simply return the user provided custom logger as-is.
    logger = parentLogger;
  }

  if (reInit) {
    registry[loggerName] = reInit;
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
