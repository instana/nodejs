/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 *
 * @param {number} ms
 * @returns {number}
 */
function msToSeconds(ms) {
  return ms / 1000;
}

/**
 * @param {Record<string, any>} heapSpaces
 * @param {string}field
 * @param {string} attributeKey
 * @returns {Array<{attributes: Record<string, any>, value: number}> | null}
 */
function heapSpacePoints(heapSpaces, field, attributeKey) {
  if (!heapSpaces || typeof heapSpaces !== 'object') return null;

  const points = Object.entries(heapSpaces)
    .filter(([, space]) => space && typeof space[field] === 'number')
    .map(([name, space]) => ({
      attributes: { [attributeKey]: name },
      value: space[field]
    }));

  return points.length ? points : null;
}

/**
 * @param {any} value
 * @param {Record<string, any>} attributes
 * @returns {Array<{attributes: Record<string, any>, value: any}>}
 */
function singlePoint(value, attributes) {
  return [{ attributes, value }];
}

module.exports = {
  msToSeconds,
  heapSpacePoints,
  singlePoint
};
