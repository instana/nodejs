'use strict';

var logger = require('../logger').getLogger('metrics-gc');
var slidingWindow = require('../slidingWindow');

var windowOpts = { duration: 1000 };
var minorGcWindow = slidingWindow.create(windowOpts);
var majorGcWindow = slidingWindow.create(windowOpts);
var incrementalMarkingsWindow = slidingWindow.create(windowOpts);
var processWeakCallbacksWindow = slidingWindow.create(windowOpts);
var gcPauseWindow = slidingWindow.create(windowOpts);

exports.payloadPrefix = 'gc';
exports.currentPayload = {
  minorGcs: 0,
  majorGcs: 0,
  incrementalMarkings: 0,
  weakCallbackProcessing: 0,
  gcPause: 0,
  statsSupported: true
};

try {
  var gcStats = require('gcstats.js');
  gcStats.on('stats', function(stats) {
    // gcstats exposes start and end in nanoseconds
    var pause = (stats.end - stats.start) / 1000000;
    gcPauseWindow.addPoint(pause);

    var type = stats.gctype;
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

    exports.currentPayload.statsSupported = true;
    exports.currentPayload.usedHeapSizeAfterGc = stats.after.usedHeapSize;
  });
} catch (e) {
  exports.currentPayload.statsSupported = false;
  logger.info(
    'Could not load gcstats.js. You will not be able to see GC information in ' +
      'Instana for this application. This typically occurs when native addons could not be ' +
      'installed during module installation (npm install). See the instructions to learn more ' +
      'about the requirements of the sensor: ' +
      'https://github.com/instana/nodejs-sensor/blob/master/README.md'
  );
}

var reducingIntervalHandle;

// always active
exports.activate = function() {
  reducingIntervalHandle = setInterval(function() {
    exports.currentPayload.minorGcs = minorGcWindow.sum();
    exports.currentPayload.majorGcs = majorGcWindow.sum();
    exports.currentPayload.incrementalMarkings = incrementalMarkingsWindow.sum();
    exports.currentPayload.weakCallbackProcessing = processWeakCallbacksWindow.sum();
    exports.currentPayload.gcPause = gcPauseWindow.sum();
  }, 1000);
};

exports.deactivate = function() {
  clearInterval(reducingIntervalHandle);
};
