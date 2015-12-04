'use strict';

var gcStats = require('gcstats.js');
var slidingWindow = require('../slidingWindow');

var windowOpts = {duration: 1000};
var minorGcWindow = slidingWindow.create(windowOpts);
var majorGcWindow = slidingWindow.create(windowOpts);
var gcPauseWindow = slidingWindow.create(windowOpts);

exports.payloadType = 'runtime';
exports.payloadPrefix = 'gc';
exports.currentPayload = {
  minorGcs: 0,
  majorGcs: 0,
  gcPause: 0
};

gcStats.on('stats', function(stats) {
  // gcstats exposes start and end in nanoseconds
  var pause = (stats.end - stats.start) / 1000000;
  gcPauseWindow.addPoint(pause);

  var type = stats.gctype;
  if (type === 1) {
    minorGcWindow.addPoint(1);
  } else if (type === 2) {
    majorGcWindow.addPoint(1);
  } else {
    minorGcWindow.addPoint(1);
    majorGcWindow.addPoint(1);
  }

  exports.currentPayload.usedHeapSizeAfterGc = stats.after.usedHeapSize;
});

var reducingIntervalHandle;

// always active
exports.activate = function() {
  reducingIntervalHandle = setInterval(function() {
    exports.currentPayload.minorGcs = minorGcWindow.sum();
    exports.currentPayload.majorGcs = majorGcWindow.sum();
    exports.currentPayload.gcPause = gcPauseWindow.sum();
  }, 1000);
};

exports.deactivate = function() {
  clearInterval(reducingIntervalHandle);
};
