'use strict';

exports.payloadPrefix = 'optDependencies';
exports.currentPayload = {
  gcstats: isAvailable('gcstats.js'),
  v8Profiler: isAvailable('v8-profiler-node8'),
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
