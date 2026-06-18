/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {Object} mapper
 * @returns {Array<Object>}
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
