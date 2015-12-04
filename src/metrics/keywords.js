'use strict';

var debug = require('debug')('instana-nodejs-sensor:name');
var applicationUnderMonitoring = require('../applicationUnderMonitoring');

exports.payloadType = 'app';
exports.payloadPrefix = 'keywords';
exports.currentPayload = [];

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJson(function(err, pckg) {
    if (err) {
      debug('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg && pckg.keywords) {
      exports.currentPayload = pckg.keywords;
    }
  });
};

exports.deactivate = function() {};
