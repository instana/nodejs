/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { metrics: coreMetrics } = require('@instana/core');
const sharedMetrics = require('@instana/shared-metrics');

exports.init = function init(config) {
  coreMetrics.init(config);
  sharedMetrics.init(config);

  coreMetrics.registerAdditionalMetrics(sharedMetrics.allMetrics);
};

exports.setLogger = function setLogger(_logger) {
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
