'use strict';

var logger;
logger = require('../logger').getLogger('metrics/libuv', function(newLogger) {
  logger = newLogger;
});

var eventLoopStats;
try {
  eventLoopStats = require('event-loop-stats');
} catch (e) {
  logger.info(
    'Could not load event-loop-stats. You will only see limited event loop information in ' +
      'Instana for this application. This typically occurs when native addons could not be ' +
      'installed during module installation (npm install). See the instructions to learn more ' +
      'about the requirements of the collector: ' +
      // eslint-disable-next-line max-len
      'https://github.com/instana/nodejs-sensor/blob/master/packages/collector/README.md#cpu-profiling-garbage-collection-and-event-loop-information'
  );
}
var lag = require('event-loop-lag')(1000);

exports.payloadPrefix = 'libuv';
exports.currentPayload = {};

Object.defineProperty(exports, 'currentPayload', {
  get: function() {
    var stats = sense();
    stats.lag = Math.round(lag() * 100) / 100;
    return stats;
  }
});

function sense() {
  if (eventLoopStats) {
    var stats = eventLoopStats.sense();
    stats.statsSupported = true;
    return stats;
  }
  return {
    statsSupported: false
  };
}
