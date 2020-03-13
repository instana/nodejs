'use strict';

var v8;
try {
  v8 = require('v8');
} catch (e) {
  // v8 module does not exist on older Node.js versions.
  v8 = null;
}

exports.payloadPrefix = 'heapSpaces';
exports.currentPayload = {};

var activeIntervalHandle = null;

exports.activate = function() {
  // Heap space statistics are available from Node.js v5.5.0 on.
  if (v8 && v8.getHeapSpaceStatistics) {
    gatherHeapSpaceStatistics();
    activeIntervalHandle = setInterval(gatherHeapSpaceStatistics, 1000);
    activeIntervalHandle.unref();
  }
};

function gatherHeapSpaceStatistics() {
  var rawStats = v8.getHeapSpaceStatistics();

  // We are changing the native format to a format which can be more
  // efficiently compressed and processed in the backend.
  var processedStats = {};

  for (var i = 0, len = rawStats.length; i < len; i++) {
    var rawStat = rawStats[i];
    processedStats[rawStat.space_name] = {
      current: rawStat.space_size,
      available: rawStat.space_available_size,
      used: rawStat.space_used_size,
      physical: rawStat.physical_space_size
    };
  }

  exports.currentPayload = processedStats;
}

exports.deactivate = function() {
  exports.currentPayload = {};
  if (activeIntervalHandle) {
    clearInterval(activeIntervalHandle);
  }
};
