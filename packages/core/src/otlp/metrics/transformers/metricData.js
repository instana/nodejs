/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const mappers = require('../mappers');

const metricMappings = mappers.getMetricTypeMappings();
// TODO: Currently restrict memory prefix
// Need more research and investigation
const ALLOWED_METRIC_PREFIXES = ['memory.'];

/**
 * Maps raw metric values into precise OTLP types with the required protocol metadata.
 *
 * @param {string|number|boolean} value
 * @param {number} timestampMs
 * @param {string} [explicitType] - Dynamic override hint ('sum', 'gauge', 'histogram', etc.)
 * @returns {Object} OTLP metric data structure with metric type key
 */
function toOtelMetricData(value, timestampMs, explicitType) {
  const ms = Number(timestampMs) || 0;
  const numericValue = Number(value) || 0;

  const metricType = metricMappings[explicitType] ? explicitType : 'sum';

  return {
    [metricType]: metricMappings[metricType](numericValue, ms)
  };
}

/**
 * Transforms a single normalized Instana metric item into an OTLP structure.
 *
 * @param {Object} rawMetric - Normalized Instana metric entry
 * @returns {Object|null} Spec-compliant OTLP Metric schema object, or null if filtered out
 */
function extractMetricData(rawMetric) {
  const isAllowedMetric = ALLOWED_METRIC_PREFIXES.some(prefix => rawMetric.name.startsWith(prefix));

  if (!isAllowedMetric) {
    return null;
  }

  const timestamp = Number(rawMetric.timestamp) || Date.now();
  const metricData = toOtelMetricData(rawMetric.value, timestamp, rawMetric.type);
  const metricType = Object.keys(metricData)[0];

  const metric = {
    name: rawMetric.name,
    unit: rawMetric.unit || '1',
    description: rawMetric.description || `Metric for ${rawMetric.name}`,
    [metricType]: metricData[metricType]
  };

  const dataPoint = metric[metricType]?.dataPoints?.[0];
  if (dataPoint && rawMetric.attributes) {
    dataPoint.attributes = rawMetric.attributes;
  }

  return metric;
}

module.exports = {
  extractMetricData,
  toOtelMetricData
};
