/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { toOtelMetricData } = require('../util');

/**
 * Transforms a single normalized Instana metric item into an OTLP structure.
 * @param {Object} rawMetric - Normalized Instana metric entry
 * @returns {Object} Spec-compliant OTLP Metric schema object
 */
function extractMetricData(rawMetric) {
  if (!rawMetric) return null;

  const metricPayload = {
    name: rawMetric.name || 'unknown.metric',
    unit: rawMetric.unit || '1',
    description: rawMetric.description || `Metric for ${rawMetric.name || 'unknown'}`
  };

  // Fix: Extract the actual sample timestamp from the item if present, else use Date.now()
  const srcTimestamp = rawMetric.timestamp ? Number(rawMetric.timestamp) : Date.now();
  const shapeData = toOtelMetricData(rawMetric.value, srcTimestamp, rawMetric.type);
  const typeKey = Object.keys(shapeData)[0];

  metricPayload[typeKey] = shapeData[typeKey];

  if (rawMetric.attributes && metricPayload[typeKey].dataPoints?.[0]) {
    metricPayload[typeKey].dataPoints[0].attributes = rawMetric.attributes;
  }

  return metricPayload;
}

module.exports = {
  extractMetricData
};
