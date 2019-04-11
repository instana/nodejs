'use strict';

var applicationUnderMonitoring = require('../util/applicationUnderMonitoring');
var logger;
logger = require('../logger').getLogger('metrics/keywords', function(newLogger) {
  logger = newLogger;
});

exports.payloadPrefix = 'keywords';
exports.currentPayload = [];

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg && pckg.keywords) {
      exports.currentPayload = pckg.keywords;
    }
  });
};
