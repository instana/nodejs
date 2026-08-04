/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const runtimeMetrics = require('./runtimeMetricsMappings');

/**
 * @param {any} _metrics
 */
// eslint-disable-next-line no-unused-vars
function get(_metrics) {
  return runtimeMetrics;
}

module.exports = {
  get
};
