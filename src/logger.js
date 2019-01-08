'use strict';

var bunyan = require('bunyan');

var bunyanToAgentStream = require('./agent/bunyanToAgentStream');

var parentLogger;

var registry = {};

exports.init = function(config) {
  var isBunyanLogger = false;
  if (config.logger && typeof config.logger.child === 'function') {
    // a custom bunyan logger has been provided via config
    parentLogger = config.logger.child({
      module: 'instana-nodejs-logger-parent',
      __in: 1
    });
    isBunyanLogger = true;
  } else if (config.logger && hasLoggingFunctions(config.logger)) {
    // a custom non-bunyan logger has been provided via config
    parentLogger = config.logger;
    isBunyanLogger = false;
  } else {
    // no custom logger has been provided via config
    parentLogger = bunyan.createLogger({
      name: 'instana-nodejs-sensor',
      __in: 1
    });
    isBunyanLogger = true;
  }

  if (isBunyanLogger) {
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

  if (typeof parentLogger.child !== 'function') {
    // non-bunyan logger
    logger = parentLogger;
  } else {
    logger = parentLogger.child({
      module: loggerName
    });
  }

  if (reInit) {
    registry[loggerName] = reInit;
  }
  return logger;
};

function hasLoggingFunctions(logger) {
  return (
    typeof logger.debug === 'function' &&
    typeof logger.info === 'function' &&
    typeof logger.warn === 'function' &&
    typeof logger.error === 'function'
  );
}
