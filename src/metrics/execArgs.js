'use strict';

exports.payloadType = 'runtime';
exports.payloadPrefix = 'execArgs';
exports.currentPayload = process.execArgv;

exports.activate = function() {};
exports.deactivate = function() {};
