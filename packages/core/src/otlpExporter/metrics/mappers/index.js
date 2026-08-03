/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const runtimeMetrics = require('./runtimeMetrics');

/**
 * @returns {{ metricMappings: import('./runtimeMetrics').MetricMapping[] }}
 */
function get() {
  return runtimeMetrics;
}

module.exports = {
  get
};
