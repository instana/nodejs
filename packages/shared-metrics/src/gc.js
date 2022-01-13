/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');

const slidingWindow = require('@instana/core').util.slidingWindow;

const windowOpts = { duration: 1000 };
const minorGcWindow = slidingWindow.create(windowOpts);
const majorGcWindow = slidingWindow.create(windowOpts);
const incrementalMarkingsWindow = slidingWindow.create(windowOpts);
const processWeakCallbacksWindow = slidingWindow.create(windowOpts);
const gcPauseWindow = slidingWindow.create(windowOpts);

/** @type {*} */
let gcStats;
let activateHasBeenCalled = false;
let hasBeenActivated = false;

exports.payloadPrefix = 'gc';

/** @type {{
 * minorGcs: number
 * majorGcs: number
 * incrementalMarkings: number
 * weakCallbackProcessing: number
 * gcPause: number
 * statsSupported?: boolean
 * usedHeapSizeAfterGc?: number
 * }} */
exports.currentPayload = {
  minorGcs: 0,
  majorGcs: 0,
  incrementalMarkings: 0,
  weakCallbackProcessing: 0,
  gcPause: 0,
  statsSupported: false
};

exports.activate = function activate() {
  activateHasBeenCalled = true;
  if (gcStats) {
    actuallyActivate();
  }
};

const nativeModuleLoader = require('./util/nativeModuleRetry')({
  nativeModuleName: 'gcstats.js',
  moduleRoot: path.join(__dirname, '..'),
  message:
    'Could not load gcstats.js. You will not be able to see GC information in Instana for this application. This ' +
    'typically occurs when native addons could not be installed during module installation (npm install). See the ' +
    'instructions to learn more about the requirements of the collector: ' +
    'https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#native-addons'
});

/** @type {NodeJS.Timeout} */
let senseIntervalHandle;

nativeModuleLoader.once('loaded', gcStats_ => {
  gcStats = gcStats_;
  exports.currentPayload.statsSupported = true;
  if (activateHasBeenCalled) {
    actuallyActivate();
  }
});

nativeModuleLoader.once('failed', () => {
  exports.currentPayload.statsSupported = false;
});

function actuallyActivate() {
  if (hasBeenActivated) {
    return;
  }
  hasBeenActivated = true;
  gcStats.on('stats', (/** @type {*} */ stats) => {
    // gcstats exposes start and end in nanoseconds
    const pause = (stats.end - stats.start) / 1000000;
    gcPauseWindow.addPoint(pause);
    const type = stats.gctype;
    if (type === 1) {
      minorGcWindow.addPoint(1);
    } else if (type === 2) {
      majorGcWindow.addPoint(1);
    } else if (type === 4) {
      incrementalMarkingsWindow.addPoint(1);
    } else if (type === 8) {
      processWeakCallbacksWindow.addPoint(1);
    } else if (type === 15) {
      minorGcWindow.addPoint(1);
      majorGcWindow.addPoint(1);
      incrementalMarkingsWindow.addPoint(1);
      processWeakCallbacksWindow.addPoint(1);
    }
    exports.currentPayload.usedHeapSizeAfterGc = stats.after.usedHeapSize;
  });
  startSensing();
}

function startSensing() {
  senseIntervalHandle = setInterval(() => {
    exports.currentPayload.minorGcs = minorGcWindow.sum();
    exports.currentPayload.majorGcs = majorGcWindow.sum();
    exports.currentPayload.incrementalMarkings = incrementalMarkingsWindow.sum();
    exports.currentPayload.weakCallbackProcessing = processWeakCallbacksWindow.sum();
    exports.currentPayload.gcPause = gcPauseWindow.sum();
  }, 1000);
  senseIntervalHandle.unref();
}

exports.deactivate = function deactivate() {
  if (senseIntervalHandle) {
    clearInterval(senseIntervalHandle);
  }
  activateHasBeenCalled = false;
  hasBeenActivated = false;
};
