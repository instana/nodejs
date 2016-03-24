'use strict';

var bunyan = require('bunyan');

var parentLogger;
var logLevel = 'info';

exports.init = function(config) {
  logLevel = config.level || logLevel;
  parentLogger = config.logger || bunyan.createLogger({ name: 'instana-nodejs-sensor' });
  parentLogger.level(logLevel);
};

exports.getLogger = function(moduleName) {
  if (!parentLogger) {
    exports.init();
  }

  var logger = parentLogger.child({ module: moduleName });
  logger.level(parentLogger.level());

  return logger;
};
