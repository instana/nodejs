'use strict';

exports.payloadPrefix = 'startTime';
exports.currentPayload = Date.now() - process.uptime() * 1000;

exports.activate = function() {};
exports.deactivate = function() {};
