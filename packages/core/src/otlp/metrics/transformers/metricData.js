/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { toOtelMetricData } = require('../util');

// TODO: Currently restrict memory prefix
// Need more research and investigation
const ALLOWED_METRIC_PREFIXES = ['memory.'];

/**
 * Transforms a single normalized Instana metric item into an OTLP structure.
 *
 * @param {Object} rawMetric - Normalized Instana metric entry
 * @returns {Object|null} Spec-compliant OTLP Metric schema object, or null if filtered out
 */
function extractMetricData(rawMetric) {
  console.log("56654567",rawMetric);
  if (!rawMetric?.name) {
    return null;
  }

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
  extractMetricData
};
