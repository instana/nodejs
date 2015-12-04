'use strict';

var debug = require('debug')('instana-nodejs-sensor:name');
var applicationUnderMonitoring = require('../applicationUnderMonitoring');

exports.payloadType = 'both';
exports.payloadPrefix = 'name';
exports.currentPayload = undefined;

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      debug('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.name;
    }
  });
};

exports.deactivate = function() {};
