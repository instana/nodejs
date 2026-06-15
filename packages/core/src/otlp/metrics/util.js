/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {Object} from
 * @returns {string}
 */
function getResourceKey(from) {
  if (!from) return 'h:empty|e:empty';
  return `h:${from.h || 'empty'}|e:${from.e || 'empty'}`;
}

/**
 * @param {Object} obj
 * @param {string} [prefix]
 * @returns {Object}
 */
function flattenObject(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return {};

  return Object.keys(obj).reduce((flattened, key) => {
    const value = obj[key];
    if (value === null || value === undefined) return flattened;

    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      flattened[newKey] = value;
    }

    return flattened;
  }, {});
}

/**
 * Normalizes flat array-based metric payloads.
 */
function normalizeArray(metricsList) {
  return metricsList.filter(Boolean).map(item => ({
    name: item.name,
    value: item.value,
    timestamp: item.timestamp || 0,
    unit: item.unit || '',
    from: item.from
  }));
}

function normalizeObject(metricsObj) {
  const { from, timestamp, ...metricsData } = metricsObj;
  const flattened = flattenObject(metricsData);
  const fallbackTimestamp = timestamp || metricsObj.timestamp || 0;

  return Object.keys(flattened).map(key => ({
    name: key,
    value: flattened[key],
    timestamp: fallbackTimestamp,
    unit: '',
    from
  }));
}

/**
 * Universal formatter for tracking and structuring incoming telemetry shapes.
 * Routes parsing elegantly without using loop components.
 */
function normalizeMetrics(metrics) {
  if (!metrics) return [];
  if (Array.isArray(metrics)) return normalizeArray(metrics);
  if (typeof metrics === 'object') return normalizeObject(metrics);
  return [];
}

/**
 * Maps raw metric values into precise OTLP types with the required protocol metadata.
 * @param {string|number|boolean} value - Inbound target value cell
 * @param {number} timestampMs - Millisecond epoch timestamp from the source record
 * @param {string} [explicitType] - Dynamic override hint ('sum' or 'gauge')
 */
function toOtelMetricData(value, timestampMs, explicitType) {
  const ms = Number(timestampMs) || 0;
  const timeUnixNano = String(ms * 1000000);

  // Path A: Sum Telemetry Structural Mapping
  if (explicitType === 'sum' || (typeof value === 'number' && explicitType !== 'gauge')) {
    return {
      sum: {
        aggregationTemporality: 1,
        isMonotonic: true,
        dataPoints: [
          {
            asDouble: Number(value) || 0,
            startTimeUnixNano: timeUnixNano,
            timeUnixNano: timeUnixNano
          }
        ]
      }
    };
  }

  // Path B: Gauge Telemetry Structural Mapping (including Booleans and Strings)
  if (explicitType === 'gauge' || typeof value === 'boolean' || typeof value === 'string') {
    let numericValue = 0;
    let customAttributes;

    if (typeof value === 'boolean') {
      numericValue = value ? 1 : 0;
    } else if (typeof value === 'string') {
      numericValue = 0;
      customAttributes = [{ key: 'value', value: { stringValue: value } }];
    } else {
      numericValue = Number(value) || 0;
    }

    const dataPoint = {
      asDouble: numericValue,
      timeUnixNano: timeUnixNano
    };

    if (customAttributes) {
      dataPoint.attributes = customAttributes;
    }

    return {
      gauge: {
        dataPoints: [dataPoint]
      }
    };
  }

  // Path C: Universal Unknown Fallback Block Configuration
  return {
    sum: {
      aggregationTemporality: 1,
      isMonotonic: true,
      dataPoints: [{ asDouble: 0, timeUnixNano: timeUnixNano }]
    }
  };
}

module.exports = {
  flattenObject,
  normalizeMetrics,
  toOtelMetricData,
  getResourceKey
};
