/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const coreMetrics = require('@instana/core').metrics;
const sharedMetrics = require('@instana/shared-metrics');
const transmissionCycle = require('./transmissionCycle');

coreMetrics.registerAdditionalMetrics(sharedMetrics.allMetrics);
const additionalCollectorMetrics = coreMetrics.findAndRequire(__dirname);
coreMetrics.registerAdditionalMetrics(additionalCollectorMetrics);

/** @type {import('@instana/core/src/logger').GenericLogger} */
const logger = require('../logger').getLogger('metrics', newLogger => {
  coreMetrics.setLogger(newLogger);
});
coreMetrics.setLogger(logger);

/**
 * @param {import('@instana/core/src/metrics').InstanaConfig} config
 */
exports.init = function init(config) {
  coreMetrics.init(config);
  transmissionCycle.init(config);
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
