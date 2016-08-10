'use strict';

var bunyan = require('bunyan');

var bunyanToAgentStream = require('./agent/bunyanToAgentStream');

var parentLogger;

exports.init = function(config) {
  if (config.logger) {
    parentLogger = config.logger.child({module: 'instana-nodejs-logger-parent'});
  } else {
    parentLogger = bunyan.createLogger({name: 'instana-nodejs-sensor'});
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

  var logger = parentLogger.child({
    module: moduleName
  });

  return logger;
};
