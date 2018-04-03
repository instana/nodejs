'use strict';

exports.payloadPrefix = 'optDependencies';
exports.currentPayload = {
  gcstats: isAvailable('gcstats.js'),
  v8Profiler: isAvailable('@risingstack/v8-profiler'),
  eventLoopStats: isAvailable('event-loop-stats')
};

exports.activate = function() {};
exports.deactivate = function() {};

function isAvailable(mod) {
  try {
    require(mod);
    return true;
  } catch (e) {
    return false;
  }
}
