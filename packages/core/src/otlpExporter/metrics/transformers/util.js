/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { POINT_TYPES, METRIC_TYPES, OTLP_AGGREGATION_TEMPORALITY } = require('../constants');

/** @typedef {import('../mappers/runtimeMetricsMappings').MetricMapping} MetricMapping */

/** @param {any} val */
function toOtlpAttributeValue(val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { intValue: val } : { doubleValue: val };
  }
  if (typeof val === 'boolean') {
    return { boolValue: val };
  }
  return { stringValue: String(val ?? '') };
}

/** @param {Record<string, any>} [attributes={}] */
function formatAttributes(attributes = {}) {
  const entries = Object.entries(attributes);
  const result = new Array(entries.length);

  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    result[i] = { key, value: toOtlpAttributeValue(val) };
  }

  return result;
}

/** @param {number} value */
function toOtlpNumericField(value) {
  return Number.isInteger(value) ? { asInt: value } : { asDouble: value };
}

/**
 * @param {Array<{ attributes: Record<string, any>, value: any }>} rawPoints
 * @param {number} timeUnixNano
 * @param {string} type
 */
function buildDataPoints(rawPoints, timeUnixNano, type) {
  const timeStr = String(timeUnixNano);
  const result = new Array(rawPoints.length);

  for (let i = 0; i < rawPoints.length; i++) {
    const { value, attributes } = rawPoints[i];
    const formattedAttributes = formatAttributes(attributes);

    if (type === METRIC_TYPES.HISTOGRAM) {
      // OTLP histogram data points require bucketCounts and explicitBounds even for a
      // degenerate single-bucket histogram (no explicit boundaries = one catch-all bucket).
      result[i] = {
        sum: value,
        count: 1,
        bucketCounts: [1],
        explicitBounds: [],
        timeUnixNano: timeStr,
        attributes: formattedAttributes
      };
    } else {
      result[i] = {
        ...toOtlpNumericField(value),
        timeUnixNano: timeStr,
        attributes: formattedAttributes
      };
    }
  }

  return result;
}

/**
 * @param {Record<string, any>} payload
 * @param {string} path
 */
function resolvePath(payload, path) {
  if (!path) return undefined;
  return path.split('.').reduce((obj, key) => obj?.[key], payload);
}

/**
 * @param {import('../mappers/runtimeMetricsMappings').HeapSpaceMapping} mapping
 * @param {any} raw
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
 * @param {import('../mappers/runtimeMetricsMappings').SinglePointMapping |
 *   import('../mappers/runtimeMetricsMappings').HistogramMapping} mapping
 * @param {any} raw
 * @param {Record<string, any>} payload
 */
function resolveScalarValue(mapping, raw, payload) {
  if (!mapping.transform && typeof raw !== 'number') return null;

  const value = mapping.transform ? mapping.transform(raw, payload) : raw;

  if (value == null || Number.isNaN(value)) return null;

  return [{ attributes: mapping.attributes ?? {}, value }];
}

/**
 * @param {MetricMapping} mapping
 * @param {Record<string, any>} payload
 */
function resolveDataPoints(mapping, payload) {
  const raw = resolvePath(payload, mapping.instana);

  if (mapping.pointType === POINT_TYPES.HEAP_SPACE) {
    return resolveHeapSpacePoints(/** @type {any} */ (mapping), raw);
  }

  return resolveScalarValue(/** @type {any} */ (mapping), raw, payload);
}

/**
 * @param {string} type
 * @param {Array<Record<string, any>>} dataPoints
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
 */
function extractMappedMetrics(metricsPayload, mapper) {
  if (!metricsPayload || !Array.isArray(mapper?.metricMappings)) {
    return [];
  }

  const timeUnixNano = toTimeUnixNano(metricsPayload.timestamp);

  const result = [];
  const mappings = mapper.metricMappings;

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const rawDataPoints = resolveDataPoints(mapping, metricsPayload);

    if (rawDataPoints) {
      result.push({
        name: mapping.name,
        unit: mapping.unit,
        ...buildMetricEnvelope(mapping.type, buildDataPoints(rawDataPoints, timeUnixNano, mapping.type))
      });
    }
  }

  return result;
}

/** @param {number} [timestampMs] */
function toTimeUnixNano(timestampMs) {
  return (timestampMs ?? Date.now()) * 1e6;
}

module.exports = {
  formatAttributes,
  buildDataPoints,
  buildMetricEnvelope,
  toOtlpNumericField,
  resolveDataPoints,
  extractMappedMetrics
};
