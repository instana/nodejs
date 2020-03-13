'use strict';

var applicationUnderMonitoring = require('@instana/core').util.applicationUnderMonitoring;

var logger = require('@instana/core').logger.getLogger('metrics');
exports.setLogger = function(_logger) {
  logger = _logger;
};

exports.payloadPrefix = 'name';
exports.currentPayload = undefined;

var MAX_ATTEMPTS = 60;
var DELAY = 1000;
var attempts = 0;

exports.activate = function() {
  attempts++;
  applicationUnderMonitoring.getMainPackageJson(function(err, packageJson) {
    if (err) {
      return logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    } else if (!packageJson && attempts < MAX_ATTEMPTS) {
      logger.debug('Main package.json could not be found. Will try again later.');
      setTimeout(exports.activate, DELAY).unref();
      return;
    } else if (!packageJson) {
      return logger.warn(
        'Main package.json could not be found. This Node.js app will be labelled "Unknown" in Instana.'
      );
    }

    exports.currentPayload = packageJson.name;
  });
};
