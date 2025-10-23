/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('@instana/core/src/config').InstanaMetricsOption|null} */
let metricsConfig = null;

/**
 * Initialize the metrics utility with the given config
 * @param {import('@instana/core/src/config').InstanaConfig} [config]
 */
exports.init = function init(config) {
  metricsConfig = config?.metrics ?? null;
};

/**
 * Check if metrics are globally disabled
 * @returns {boolean} True if metrics are disabled, false otherwise
 */
exports.areMetricsDisabled = function areMetricsDisabled() {
  return metricsConfig?.enabled === false;
};
