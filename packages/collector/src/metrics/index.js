'use strict';

var coreMetrics = require('@instana/core').metrics;
var sharedMetrics = require('@instana/shared-metrics');
var transmissionCycle = require('./transmissionCycle');

coreMetrics.registerAdditionalMetrics(sharedMetrics.allMetrics);
var additionalCollectorMetrics = coreMetrics.findAndRequire(__dirname);
coreMetrics.registerAdditionalMetrics(additionalCollectorMetrics);

var logger = require('../logger').getLogger('metrics', function(newLogger) {
  coreMetrics.setLogger(newLogger);
});
coreMetrics.setLogger(logger);

exports.init = function(config) {
  coreMetrics.init(config);
  transmissionCycle.init(config);
};

exports.activate = function() {
  coreMetrics.activate();
};

exports.deactivate = function() {
  coreMetrics.deactivate();
};

exports.gatherData = function gatherData() {
  return coreMetrics.gatherData();
};
