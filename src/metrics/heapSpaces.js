'use strict';

var v8;
try {
  v8 = require('v8');
} catch (e) {
  // v8 module does not exist on older Node.js versions.
  v8 = null;
}

exports.payloadType = 'runtime';
exports.payloadPrefix = 'heapSpaces';
exports.currentPayload = [];

var activeIntervalHandle = null;

exports.activate = function() {
  // Heap space statistics are available from Node.js v5.5.0 on.
  if (v8 && v8.getHeapSpaceStatistics) {
    gatherHeapSpaceStatistics();
    activeIntervalHandle = setInterval(gatherHeapSpaceStatistics, 1000);
  }
};

function gatherHeapSpaceStatistics() {
  exports.currentPayload = v8.getHeapSpaceStatistics();
}

exports.deactivate = function() {
  exports.currentPayload = [];
  if (activeIntervalHandle) {
    clearInterval(activeIntervalHandle);
  }
};
