/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {Record<string, any>} from
 * @returns {string}
 */
function getResourceKey(from) {
  if (!from) return 'h:empty|e:empty';
  return `h:${from.h || 'empty'}|e:${from.e || 'empty'}`;
}

/**
 * @param {Record<string, any>} obj
 * @param {string} [prefix]
 * @returns {Record<string, any>}
 */
function flattenObject(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return {};

  return Object.keys(obj).reduce(
    /**
     * @param {Record<string, any>} flattened
     * @param {string} key
     */
    (flattened, key) => {
      const value = obj[key];
      if (value === null || value === undefined) return flattened;

      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, flattenObject(value, newKey));
      } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        flattened[newKey] = value;
      }

      return flattened;
    },
    /** @type {Record<string, any>} */ ({})
  );
}

/**
 * Normalized to internal format for easier mapping
 * @param {any} metrics
 */
function normalizeMetrics(metrics) {
  if (Array.isArray(metrics)) {
    return normalizeArray(metrics);
  } else if (typeof metrics === 'object' && metrics !== null) {
    return normalizeObject(metrics);
  }
  return [];
}

/**
 * @param {any[]} metricsList
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
 * @param {{ [x: string]: any; timestamp: any; from?: any; }} metricsObj
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

module.exports = {
  flattenObject,
  normalizeMetrics,
  getResourceKey
};
