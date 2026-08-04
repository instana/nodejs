/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { METRIC_TYPES } = require('../mappers/constants');
const { buildDataPoints } = require('./util');

/**
 * @typedef {import('../mappers/runtimeMetricsMappings').MetricMapping} MetricMapping
 */

const OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE = 2;

/**
 * @param {string} type
 * @param {Array<Record<string, any>>} dataPoints
 * @returns {Record<string, any>} OTLP
 */
function buildMetricEnvelope(type, dataPoints) {
  switch (type) {
    case METRIC_TYPES.UPDOWNCOUNTER:
      return {
        sum: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE,
          isMonotonic: false,
          dataPoints
        }
      };

    case METRIC_TYPES.HISTOGRAM:
      return {
        histogram: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE,
          dataPoints
        }
      };

    case METRIC_TYPES.GAUGE:
    default:
      return {
        gauge: {
          dataPoints
        }
      };
  }
}

/**
 * Converts Instana runtime metrics into OTLP metric objects.
 *
 * @param {Record<string, any>} metricsPayload
 * @param {{ metricMappings: MetricMapping[] }} mapper
 * @returns {Array<Record<string, any>>} OTLP
 */
function extractMetrics(metricsPayload, mapper) {
  if (!metricsPayload || !Array.isArray(mapper?.metricMappings)) {
    return [];
  }

  const timeUnixNano = (metricsPayload.timestamp ?? Date.now()) * 1e6;

  return mapper.metricMappings.reduce((metrics, mapping) => {
    const rawDataPoints = mapping.dataPoints(metricsPayload);

    if (!rawDataPoints) {
      return metrics;
    }

    // @ts-ignore
    metrics.push({
      name: mapping.name,
      unit: mapping.unit,
      ...buildMetricEnvelope(mapping.type, buildDataPoints(rawDataPoints, timeUnixNano))
    });

    return metrics;
  }, []);
}

module.exports = {
  extractMetrics
};
