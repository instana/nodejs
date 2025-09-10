/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const coreMetrics = require('@instana/core').metrics;
const sharedMetrics = require('@instana/shared-metrics');
const transmissionCycle = require('./transmissionCycle');
const pid = require('./pid');

const additionalMetrics = [pid];

/**
 * @param {import('@instana/core/src/metrics').InstanaConfig} config
 * @param {import('@instana/core/src/util').CoreUtilsType} utils
 * @param {any} pidStore
 */
exports.init = function init(config, utils, pidStore) {
  coreMetrics.init(config);
  sharedMetrics.init(config);
  transmissionCycle.init(config, utils);

  additionalMetrics.forEach(metric => {
    metric.init(config, pidStore);
  });

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
