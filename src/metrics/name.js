'use strict';

var applicationUnderMonitoring = require('../applicationUnderMonitoring');
var logger;
logger = require('../logger').getLogger('metrics/name', function(newLogger) {
  logger = newLogger;
});

exports.payloadPrefix = 'name';
exports.currentPayload = undefined;

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.name;
    }
  });
};

exports.deactivate = function() {};
