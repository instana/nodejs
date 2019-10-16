'use strict';

const { metrics: coreMetrics } = require('@instana/core');

coreMetrics.registerAdditionalMetrics([
  require('./npmPackageName'),
  require('./npmPackageVersion'),
  require('./npmPackageDescription')
]);

exports.init = function init(config) {
  coreMetrics.init(config);
};

exports.activate = function activate() {
  coreMetrics.activate();
};

exports.deactivate = function deactivate() {
  coreMetrics.deactivate();
};

exports.gatherData = function gatherData() {
  return coreMetrics.gatherData();
};
