'use strict';

var debug = require('debug')('instana-nodejs-sensor:description');
var applicationUnderMonitoring = require('../applicationUnderMonitoring');

exports.payloadType = 'app';
exports.payloadPrefix = 'description';
exports.currentPayload = undefined;

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      debug('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.description;
    }
  });
};

exports.deactivate = function() {};
