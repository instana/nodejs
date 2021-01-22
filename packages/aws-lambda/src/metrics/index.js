/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

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
