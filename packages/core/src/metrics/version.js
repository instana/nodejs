'use strict';

var applicationUnderMonitoring = require('../util/applicationUnderMonitoring');
var logger;
logger = require('../logger').getLogger('metrics/version', function(newLogger) {
  logger = newLogger;
});

exports.payloadPrefix = 'version';
exports.currentPayload = undefined;

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.version;
    }
  });
};
