/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

exports.payloadPrefix = 'memory';
// @ts-ignore
exports.currentPayload = {};

/** @type {NodeJS.Timer} */
let activeIntervalHandle = null;

exports.activate = function activate() {
  gatherMemoryUsageStatistics();
  activeIntervalHandle = setInterval(gatherMemoryUsageStatistics, 1000);
  activeIntervalHandle.unref();
};

function gatherMemoryUsageStatistics() {
  // @ts-ignore
  exports.currentPayload = process.memoryUsage();
}

exports.deactivate = function deactivate() {
  // @ts-ignore
  exports.currentPayload = {};
  if (activeIntervalHandle) {
    clearInterval(activeIntervalHandle);
  }
};
