/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { extractMappedMetrics } = require('./util');

/**
 * @param {Record<string, any>} metricsPayload
 * @param {{ metricMappings: import('../mappers/runtimeMetricsMappings').MetricMapping[] }} mapper
 * @returns {Array<Record<string, any>>} OTLP metric objects
 */
function extractMetrics(metricsPayload, mapper) {
  return extractMappedMetrics(metricsPayload, mapper);
}

module.exports = {
  extractMetrics
};
