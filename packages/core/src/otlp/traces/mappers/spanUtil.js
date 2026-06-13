/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { INSTRUMENTATION_TYPES } = require('../constants');

/**
 * Get the span type (instrumentation type) from an Instana span
 * @param {Object} instanaSpan
 * @returns {string|null}
 */
function getSpanType(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) return null;

  const keys = Object.keys(instanaSpan.data);
  const len = keys.length;
  if (len === 0) return null;

  // Find the first key that's not 'peer' or 'resource'
  for (let i = 0; i < len; i++) {
    const key = keys[i];
    if (key !== INSTRUMENTATION_TYPES.PEER && key !== 'resource') {
      return key;
    }
  }

  return keys[0];
}

/**
 * Get the data object for a specific span type
 * @param {Object} instanaSpan
 * @param {string} [spanType] - Optional span type, will be detected if not provided
 * @returns {Object|null}
 */
function getSpanData(instanaSpan, spanType) {
  const type = spanType || getSpanType(instanaSpan);
  return type ? instanaSpan.data?.[type] : null;
}

module.exports = {
  getSpanType,
  getSpanData
};
