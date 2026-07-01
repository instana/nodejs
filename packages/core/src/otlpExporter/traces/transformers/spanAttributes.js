/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @typedef {Object} AttributeMapper
 * @property {function(import('../../../core').InstanaBaseSpan): Array<{ key: string, value: any }>} spanAttributes
 */

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {AttributeMapper} mapper
 * @returns {Array<{ key: string, value: any }>}
 */
function extractSpanAttributes(span, mapper) {
  if (!span?.data) {
    return [];
  }

  return mapper.spanAttributes(span);
}

module.exports = {
  extractSpanAttributes
};
