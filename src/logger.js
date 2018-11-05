'use strict';

var bunyan = require('bunyan');

var bunyanToAgentStream = require('./agent/bunyanToAgentStream');

var parentLogger;

exports.init = function(config) {
  if (config.logger && typeof config.logger.child === 'function') {
    parentLogger = config.logger.child({
      module: 'instana-nodejs-logger-parent',
      __in: 1
    });
  } else if (config.logger && hasLoggingFunctions(config.logger)) {
    parentLogger = config.logger;
    return;
  } else {
    parentLogger = bunyan.createLogger({
      name: 'instana-nodejs-sensor',
      __in: 1
    });
  }

  parentLogger.addStream({
    type: 'raw',
    stream: bunyanToAgentStream,
    level: 'info'
  });

  if (config.level) {
    parentLogger.level(config.level);
  }
};

exports.getLogger = function(moduleName) {
  if (!parentLogger) {
    exports.init({});
  }

  if (typeof parentLogger.child !== 'function') {
    return parentLogger;
  }

  var logger = parentLogger.child({
    module: moduleName
  });

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
