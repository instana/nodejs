'use strict';

var bunyan = require('bunyan');

var bunyanToAgentStream = require('./agent/bunyanToAgentStream');

var parentLogger;

exports.init = function(config) {
  var loggerOptions = {
    name: 'instana-nodejs-sensor'
  };

  if (config.level) {
    loggerOptions.level = config.level;
  }

  if (config.logger) {
    parentLogger = config.logger.child(loggerOptions, false);
  } else {
    parentLogger = bunyan.createLogger(loggerOptions);
  }

  parentLogger.addStream({
    type: 'raw',
    stream: bunyanToAgentStream,
    level: 'info'
  });
};

exports.getLogger = function(moduleName) {
  if (!parentLogger) {
    exports.init({});
  }

  var logger = parentLogger.child({
    module: moduleName
  });

  return logger;
};
