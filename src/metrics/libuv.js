'use strict';

var eventLoopStats = require('event-loop-stats');
var lag = require('event-loop-lag')(1000);

exports.payloadType = 'runtime';
exports.payloadPrefix = 'libuv';
exports.currentPayload = {};

Object.defineProperty(exports, 'currentPayload', {
  get: function() {
    var stats = eventLoopStats.sense();
    stats.lag = Math.round(lag() * 100) / 100;
    return stats;
  }
});

exports.activate = function() {};
exports.deactivate = function() {};
