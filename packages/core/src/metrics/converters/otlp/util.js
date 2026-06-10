/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {Object} from
 * @returns {string}
 */
function getResourceKey(from) {
  return JSON.stringify(from || {});
}

/**
 * @param {Object} obj
 * @param {string} prefix
 * @returns {Object}
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};

  if (!obj || typeof obj !== 'object') {
    return flattened;
  }

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) return;

    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      flattened[newKey] = value;
    }
  });

  return flattened;
}

/**
 * @param {string|number|boolean} value
 * @returns {Object}
 */
function toOtelMetricData(value) {
  if (typeof value === 'number') {
    return {
      sum: {
        dataPoints: [{ asDouble: value }]
      }
    };
  }

  if (typeof value === 'string') {
    return {
      gauge: {
        dataPoints: [
          {
            asDouble: 0,
            attributes: [
              {
                key: 'value',
                value: { stringValue: value }
              }
            ]
          }
        ]
      }
    };
  }

  if (typeof value === 'boolean') {
    return {
      gauge: {
        dataPoints: [
          {
            asDouble: value ? 1 : 0
          }
        ]
      }
    };
  }

  return {
    sum: {
      dataPoints: [{ asDouble: 0 }]
    }
  };
}

module.exports = {
  flattenObject,
  toOtelMetricData,
  getResourceKey
};
