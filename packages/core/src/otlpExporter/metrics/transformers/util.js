/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { POINT_TYPES, METRIC_TYPES, OTLP_AGGREGATION_TEMPORALITY } = require('../constants');

/**
 * @typedef {import('../mappers/runtimeMetricsMappings').MetricMapping} MetricMapping
 */

/**
 * Converts a primitive value into an OTLP-compliant typed value container.
 *
 * @param {any} val
 * @returns {Record<string, any>}
 */
function toOtlpAttributeValue(val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { intValue: val } : { doubleValue: val };
  }
  if (typeof val === 'boolean') {
    return { boolValue: val };
  }
  return { stringValue: String(val ?? '') };
}

/**
 * @param {Record<string, any>} [attributes={}]
 * @returns {Array<{ key: string, value: Record<string, any> }>}
 */
function formatAttributes(attributes = {}) {
  const entries = Object.entries(attributes);
  const result = new Array(entries.length);

  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    result[i] = {
      key,
      value: toOtlpAttributeValue(val)
    };
  }

  return result;
}

/**
 * @param {any} value
 * @returns {Record<string, any>}
 */
function toOtlpNumericField(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { asInt: value } : { asDouble: value };
  }
  if (value && typeof value === 'object' && ('count' in value || 'sum' in value)) {
    return { count: String(value.count), sum: value.sum };
  }
  return { asDouble: Number(value) };
}

/**
 * @param {Array<{ attributes: Record<string, any>, value: any }>} rawPoints
 * @param {number} timeUnixNano
 * @returns {Array<Record<string, any>>}
 */
function buildDataPoints(rawPoints, timeUnixNano) {
  const timeStr = String(timeUnixNano);
  const result = new Array(rawPoints.length);

  for (let i = 0; i < rawPoints.length; i++) {
    const { value, attributes } = rawPoints[i];
    result[i] = {
      ...toOtlpNumericField(value),
      timeUnixNano: timeStr,
      attributes: formatAttributes(attributes)
    };
  }

  return result;
}

/**
 * @param {Record<string, any>} payload
 * @param {string} path
 * @returns {any}
 */
function resolvePath(payload, path) {
  if (!path) return undefined;
  return path.split('.').reduce((obj, key) => obj?.[key], payload);
}

/**
 * @param {MetricMapping} mapping
 * @param {any} raw
 * @returns {Array<{ attributes: Record<string, any>, value: any }> | null}
 */
function resolveHeapSpacePoints(mapping, raw) {
  if (!raw || typeof raw !== 'object') return null;

  const entries = Object.entries(raw);
  const points = [];

  for (let i = 0; i < entries.length; i++) {
    const [name, space] = entries[i];
    if (space && typeof space[mapping.field] === 'number') {
      points.push({
        attributes: { [mapping.attributeKey]: name },
        value: space[mapping.field]
      });
    }
  }

  return points.length ? points : null;
}

/**
 * @param {MetricMapping} mapping
 * @param {any} raw
 * @param {Record<string, any>} payload
 * @returns {Array<{ attributes: Record<string, any>, value: any }> | null}
 */
function resolveScalarValue(mapping, raw, payload) {
  if (!mapping.transform && typeof raw !== 'number') return null;

  const value = mapping.transform ? mapping.transform(raw, payload) : raw;

  if (value == null || Number.isNaN(value)) return null;

  const attributes = mapping.attributes ?? {};

  if (mapping.pointType === POINT_TYPES.HISTOGRAM) {
    return [{ attributes, value: { count: 1, sum: value } }];
  }

  return [{ attributes, value }];
}

/**
 * @param {MetricMapping} mapping
 * @param {Record<string, any>} payload
 * @returns {Array<{ attributes: Record<string, any>, value: any }> | null}
 */
function resolveDataPoints(mapping, payload) {
  const raw = resolvePath(payload, mapping.instana);

  if (mapping.pointType === POINT_TYPES.HEAP_SPACE) {
    return resolveHeapSpacePoints(mapping, raw);
  }

  return resolveScalarValue(mapping, raw, payload);
}
/**
 * @param {string} type - One of METRIC_TYPES
 * @param {Array<Record<string, any>>} dataPoints
 * @returns {Record<string, any>}
 */
function buildMetricEnvelope(type, dataPoints) {
  switch (type) {
    case METRIC_TYPES.UPDOWNCOUNTER:
      return {
        sum: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY.CUMULATIVE,
          isMonotonic: false,
          dataPoints
        }
      };

    case METRIC_TYPES.HISTOGRAM:
      return {
        histogram: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY.DELTA,
          dataPoints
        }
      };

    case METRIC_TYPES.GAUGE:
    default:
      return { gauge: { dataPoints } };
  }
}

/**
 * @param {Record<string, any>} metricsPayload
 * @param {{ metricMappings: MetricMapping[] }} mapper
 * @returns {Array<Record<string, any>>} OTLP metric objects
 */
function extractMappedMetrics(metricsPayload, mapper) {
  const timeUnixNano = toTimeUnixNano(metricsPayload?.timestamp);
  if (!metricsPayload || !Array.isArray(mapper?.metricMappings)) {
    return [];
  }

  const result = [];
  const mappings = mapper.metricMappings;

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const rawDataPoints = resolveDataPoints(mapping, metricsPayload);

    if (rawDataPoints) {
      result.push({
        name: mapping.name,
        unit: mapping.unit,
        ...buildMetricEnvelope(mapping.type, buildDataPoints(rawDataPoints, timeUnixNano))
      });
    }
  }

  return result;
}

/**
 * @param {number} [timestampMs]
 * @returns {number}
 */
function toTimeUnixNano(timestampMs) {
  return (timestampMs ?? Date.now()) * 1e6;
}

module.exports = {
  formatAttributes,
  buildDataPoints,
  buildMetricEnvelope,
  resolveDataPoints,
  extractMappedMetrics
};
