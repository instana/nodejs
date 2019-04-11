'use strict';

exports.payloadPrefix = 'startTime';
exports.currentPayload = Date.now() - process.uptime() * 1000;
