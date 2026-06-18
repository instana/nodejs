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

/**
 * Normalized to internal format for easier mapping
 */
function normalizeObject(metricsObj) {
  const { from, timestamp, ...metricsData } = metricsObj;
  const flattened = flattenObject(metricsData);
  const fallbackTimestamp = timestamp || metricsObj.timestamp || 0;

  return Object.keys(flattened).map(key => ({
    name: key,
    value: flattened[key],
    timestamp: fallbackTimestamp,
    unit: '', // we don't have any unit
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

module.exports = {
  flattenObject,
  normalizeMetrics,
  getResourceKey
};
