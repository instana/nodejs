'use strict';

var applicationUnderMonitoring = require('../applicationUnderMonitoring');
var logger = require('../logger').getLogger('name');

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
