'use strict';

var debug = require('debug')('instana-nodejs-sensor:version');
var applicationUnderMonitoring = require('../applicationUnderMonitoring');

exports.payloadType = 'both';
exports.payloadPrefix = 'version';
exports.currentPayload = undefined;

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      debug('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.version;
    }
  });
};

exports.deactivate = function() {};
