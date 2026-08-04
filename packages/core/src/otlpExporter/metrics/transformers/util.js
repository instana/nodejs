/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

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
 * Serialises the raw data-points produced by a mapper into OTLP data-point
 * objects, adding `timeUnixNano` and converting the `attributes` map into the
 * OTLP key-value array format.
 *
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
      // histogram value shape: { count, sum }
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

module.exports = {
  formatAttributes,
  buildDataPoints
};
