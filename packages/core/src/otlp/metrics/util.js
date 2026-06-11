/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

function getResourceKey(from) {
  if (!from) return 'h:empty|e:empty';
  return `h:${from.h || 'empty'}|e:${from.e || 'empty'}`;
}

function flattenObject(obj, prefix = '') {
  const flattened = {};
  if (!obj || typeof obj !== 'object') return flattened;

  const keys = Object.keys(obj);
  const len = keys.length;

  for (let i = 0; i < len; i++) {
    const key = keys[i];
    const value = obj[key];
    if (value === null || value === undefined) continue;

    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const subFlattened = flattenObject(value, newKey);
      const subKeys = Object.keys(subFlattened);
      for (let j = 0; j < subKeys.length; j++) {
        const subKey = subKeys[j];
        flattened[subKey] = subFlattened[subKey];
      }
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      flattened[newKey] = value;
    }
  }

  return flattened;
}

/**
 * Maps raw metric values into precise OTLP types with the required protocol metadata.
 * @param {string|number|boolean} value - Inbound target value cell
 * @param {number} timestampMs - Millisecond epoch timestamp from the source record
 * @param {string} [explicitType] - Dynamic override hint ('sum' or 'gauge')
 */
function toOtelMetricData(value, timestampMs, explicitType) {
  // Safe validation guarding timestamp transformations
  const ms = Number(timestampMs) || Date.now();
  const timeUnixNano = String(ms * 1000000);

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
  toOtelMetricData,
  getResourceKey
};
