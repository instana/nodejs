'use strict';

exports.payloadPrefix = 'memory';
exports.currentPayload = {};

var activeIntervalHandle = null;

exports.activate = function() {
  gatherMemoryUsageStatistics();
  activeIntervalHandle = setInterval(gatherMemoryUsageStatistics, 1000);
  activeIntervalHandle.unref();
};

function gatherMemoryUsageStatistics() {
  exports.currentPayload = process.memoryUsage();
}

exports.deactivate = function() {
  exports.currentPayload = {};
  if (activeIntervalHandle) {
    clearInterval(activeIntervalHandle);
  }
};
