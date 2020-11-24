'use strict';

const path = require('path');

const slidingWindow = require('@instana/core').util.slidingWindow;

const windowOpts = { duration: 1000 };
const minorGcWindow = slidingWindow.create(windowOpts);
const majorGcWindow = slidingWindow.create(windowOpts);
const incrementalMarkingsWindow = slidingWindow.create(windowOpts);
const processWeakCallbacksWindow = slidingWindow.create(windowOpts);
const gcPauseWindow = slidingWindow.create(windowOpts);

exports.payloadPrefix = 'gc';
exports.currentPayload = {
  minorGcs: 0,
  majorGcs: 0,
  incrementalMarkings: 0,
  weakCallbackProcessing: 0,
  gcPause: 0
};

const nativeModuleLoader = require('./util/nativeModuleRetry')({
  nativeModuleName: 'gcstats.js',
  moduleRoot: path.join(__dirname, '..'),
  message:
    'Could not load gcstats.js. You will not be able to see GC information in Instana for this application. This ' +
    'typically occurs when native addons could not be installed during module installation (npm install). See the ' +
    'instructions to learn more about the requirements of the collector: ' +
    'https://www.instana.com/docs/ecosystem/node-js/installation/#native-addons'
});

let senseIntervalHandle;

exports.activate = function activate() {
  nativeModuleLoader.on('loaded', gcStats => {
    exports.currentPayload.statsSupported = true;
    gcStats.on('stats', stats => {
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
  });

  nativeModuleLoader.on('failed', () => {
    exports.currentPayload.statsSupported = false;
  });
};

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
};
