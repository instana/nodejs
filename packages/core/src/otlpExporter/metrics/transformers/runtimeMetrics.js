/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @typedef {import('../mappers/runtimeMetrics').MetricMapping} MetricMapping
 */

/**
 * Iterates the mapper's declarative metricMappings and produces an array of
 * OTLP metric objects for the given Instana metrics payload.
 *
 * This is the engine — it knows nothing about specific metric names or field
 * paths; all that knowledge lives in the mapper's mapping tables.
 *
 * @param {Record<string, any>} metricsPayload  Top-level Instana metrics object
 * @param {{ metricMappings: MetricMapping[] }} mapper
 * @returns {Array<{ descriptor: { name: string, unit: string }, type: string, dataPoints: Array<any> }>}
 */
function extractMetrics(metricsPayload, mapper) {
  if (!metricsPayload || !mapper || !Array.isArray(mapper.metricMappings)) {
    return [];
  }

  /** @type {Array<{ descriptor: { name: string, unit: string }, type: string, dataPoints: Array<any> }>} */
  const result = [];

  for (const mapping of mapper.metricMappings) {
    const dataPoints = mapping.dataPoints(metricsPayload);
    if (!dataPoints) continue;

    result.push({
      descriptor: { name: mapping.name, unit: mapping.unit },
      type: mapping.type,
      dataPoints
    });
  }

  return result;
}

module.exports = {
  extractMetrics
};
