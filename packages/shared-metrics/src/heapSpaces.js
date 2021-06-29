/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

/** @type {import('v8')} */
let v8;
try {
  v8 = require('v8');
} catch (e) {
  // v8 module does not exist on older Node.js versions.
  v8 = null;
}

exports.payloadPrefix = 'heapSpaces';
// @ts-ignore
exports.currentPayload = {};

/** @type {NodeJS.Timeout} */
let activeIntervalHandle = null;

exports.activate = function activate() {
  // Heap space statistics are available from Node.js v5.5.0 on.
  if (v8 && v8.getHeapSpaceStatistics) {
    gatherHeapSpaceStatistics();
    activeIntervalHandle = setInterval(gatherHeapSpaceStatistics, 1000);
    activeIntervalHandle.unref();
  }
};

function gatherHeapSpaceStatistics() {
  const rawStats = v8.getHeapSpaceStatistics();

  // We are changing the native format to a format which can be more
  // efficiently compressed and processed in the backend.
  /** @type {Object.<string, *>} */
  const processedStats = {};

  for (let i = 0, len = rawStats.length; i < len; i++) {
    const rawStat = rawStats[i];
    processedStats[rawStat.space_name] = {
      current: rawStat.space_size,
      available: rawStat.space_available_size,
      used: rawStat.space_used_size,
      physical: rawStat.physical_space_size
    };
  }

  // @ts-ignore
  exports.currentPayload = processedStats;
}

exports.deactivate = function deactivate() {
  // @ts-ignore
  exports.currentPayload = {};
  if (activeIntervalHandle) {
    clearInterval(activeIntervalHandle);
  }
};
