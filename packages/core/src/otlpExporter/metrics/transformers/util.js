/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { METRIC_TYPES } = require('../mappers/constants');
const { resolvePath } = require('../mappers/util');

/**
 * @typedef {import('../mappers/runtimeMetricsMappings').MetricMapping} MetricMapping
 */

/**
 * @param {Record<string, any>} attributes
 * @returns {Array<{ key: string, value: Record<string, any> }>}
 */
function formatAttributes(attributes) {
  return Object.keys(attributes).map(key => {
    const val = attributes[key];
    const type = typeof val;
    let value;

    if (type === 'number') {
      value = Number.isInteger(val) ? { intValue: val } : { doubleValue: val };
    } else if (type === 'boolean') {
      value = { boolValue: val };
    } else {
      value = { stringValue: String(val) };
    }

    return { key, value };
  });
}

/**
 * @param {Array<{ attributes: Record<string, any>, value: any }>} rawPoints
 * @param {number} timeUnixNano
 * @returns {Array<Record<string, any>>}
 */
function buildDataPoints(rawPoints, timeUnixNano) {
  return rawPoints.map(point => {
    const val = point.value;
    const type = typeof val;
    let numericField;

    if (type === 'number') {
      numericField = Number.isInteger(val) ? { asInt: val } : { asDouble: val };
    } else if (val !== null && type === 'object' && ('count' in val || 'sum' in val)) {
      numericField = { count: String(val.count), sum: val.sum };
    } else {
      numericField = { asDouble: Number(val) };
    }

    return {
      ...numericField,
      timeUnixNano: String(timeUnixNano),
      attributes: formatAttributes(point.attributes)
    };
  });
}

const OTLP_AGGREGATION_TEMPORALITY_CUMULATIVE = 2;

/**
 * @param {string} type  - One of METRIC_TYPES
 * @param {Array<Record<string, any>>} dataPoints
 * @returns {Record<string, any>}
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
      return { gauge: { dataPoints } };
  }
}

/**
 * Supported `pointType` values:
 *   'single'    — scalar field  → one data point
 *   'histogram' — scalar field  → one histogram data point ({ count, sum })
 *   'heapSpace' — object map    → one data point per entry
 *
 * @param {MetricMapping} mapping
 * @param {Record<string, any>} payload
 * @returns {Array<{ attributes: Record<string, any>, value: any }> | null}
 */
function resolveDataPoints(mapping, payload) {
  if (mapping.pointType === 'heapSpace') {
    const heapSpaces = resolvePath(payload, mapping.instana);
    if (!heapSpaces || typeof heapSpaces !== 'object') return null;

    const points = Object.entries(heapSpaces)
      .filter(([, space]) => space && typeof space[mapping.field] === 'number')
      .map(([name, space]) => ({
        attributes: { [mapping.attributeKey]: name },
        value: space[mapping.field]
      }));

    return points.length ? points : null;
  }

  const raw = resolvePath(payload, mapping.instana);

  if (!mapping.transform && typeof raw !== 'number') return null;

  const value = mapping.transform ? mapping.transform(raw, payload) : raw;

  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && isNaN(value)) return null;

  const attributes = mapping.attributes ?? {};

  if (mapping.pointType === 'histogram') {
    return [{ attributes, value: { count: 1, sum: value } }];
  }

  return [{ attributes, value }];
}

/**
 * @param {Record<string, any>} metricsPayload
 * @param {{ metricMappings: MetricMapping[] }} mapper
 * @param {number} timeUnixNano
 * @returns {Array<Record<string, any>>} OTLP metric objects
 */
function extractMappedMetrics(metricsPayload, mapper, timeUnixNano) {
  if (!metricsPayload || !Array.isArray(mapper?.metricMappings)) {
    return [];
  }

  return mapper.metricMappings.reduce((/** @type {any[]} */ acc, mapping) => {
    const rawDataPoints = resolveDataPoints(mapping, metricsPayload);

    if (rawDataPoints) {
      acc.push({
        name: mapping.name,
        unit: mapping.unit,
        ...buildMetricEnvelope(mapping.type, buildDataPoints(rawDataPoints, timeUnixNano))
      });
    }

    return acc;
  }, []);
}

module.exports = {
  formatAttributes,
  buildDataPoints,
  buildMetricEnvelope,
  resolveDataPoints,
  extractMappedMetrics
};
