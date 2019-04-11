'use strict';

var coreMetrics = require('@instana/core').metrics;

var additionalMetricsModules = coreMetrics.findAndRequire(__dirname);

coreMetrics.registerAdditionalMetrics(additionalMetricsModules);

exports.init = function(config) {
  coreMetrics.init(config);
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
