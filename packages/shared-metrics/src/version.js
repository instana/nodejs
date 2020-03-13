'use strict';

var applicationUnderMonitoring = require('@instana/core').util.applicationUnderMonitoring;

var logger = require('@instana/core').logger.getLogger('metrics');
exports.setLogger = function(_logger) {
  logger = _logger;
};

exports.payloadPrefix = 'version';
exports.currentPayload = undefined;

var MAX_ATTEMPTS = 20;
var DELAY = 1000;
var attempts = 0;

exports.activate = function() {
  attempts++;
  applicationUnderMonitoring.getMainPackageJson(function(err, packageJson) {
    if (err) {
      return logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    } else if (!packageJson && attempts < MAX_ATTEMPTS) {
      setTimeout(exports.activate, DELAY).unref();
      return;
    } else if (!packageJson) {
      // final attempt failed, ignore silently
      return;
    }

    exports.currentPayload = packageJson.version;
  });
};
