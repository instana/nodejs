/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const core = require('@instana/core');
const sharedMetrics = require('@instana/shared-metrics');
const transmissionCycle = require('./transmissionCycle');
const pid = require('./pid');

const additionalMetrics = [pid];

/**
 * @param {import('@instana/core/src/metrics').InstanaConfig} config
 * @param {any} pidStore
 */
exports.init = function init(config, pidStore) {
  core.metrics.init(config);
  sharedMetrics.init(config);
  transmissionCycle.init(config);

  additionalMetrics.forEach(metric => {
    metric.init(config, pidStore);
  });

  core.metrics.registerAdditionalMetrics(sharedMetrics.allMetrics);
  const additionalCollectorMetrics = core.metrics.findAndRequire(__dirname);
  core.metrics.registerAdditionalMetrics(additionalCollectorMetrics);
};

exports.activate = function activate() {
  core.metrics.activate();
};

exports.deactivate = function deactivate() {
  core.metrics.deactivate();
};

exports.gatherData = function gatherData() {
  return core.metrics.gatherData();
};
