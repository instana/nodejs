/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const coreMetrics = require('@instana/core').metrics;
const sharedMetrics = require('@instana/shared-metrics');
const transmissionCycle = require('./transmissionCycle');

/**
 * @param {import('@instana/core/src/metrics').InstanaConfig} config
 */
exports.init = function init(config) {
  coreMetrics.init(config);
  transmissionCycle.init(config);

  coreMetrics.registerAdditionalMetrics(sharedMetrics.allMetrics);
  const additionalCollectorMetrics = coreMetrics.findAndRequire(__dirname);
  coreMetrics.registerAdditionalMetrics(additionalCollectorMetrics);
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
