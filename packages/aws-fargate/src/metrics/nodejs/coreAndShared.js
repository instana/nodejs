'use strict';

const { metrics: coreMetrics } = require('@instana/core');
const { consoleLogger } = require('@instana/serverless');
const sharedMetrics = require('@instana/shared-metrics');

coreMetrics.registerAdditionalMetrics(sharedMetrics.allMetrics);
coreMetrics.setLogger(consoleLogger);

exports.init = function init(config) {
  coreMetrics.init(config);
};

exports.setLogger = function(_logger) {
  coreMetrics.setLogger(_logger);
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
