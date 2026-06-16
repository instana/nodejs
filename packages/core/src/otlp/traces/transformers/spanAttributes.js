/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {{ get: Function }} mappers
 * @returns {Array<Object>}
 */
function extractSpanAttributes(span, mappers) {
  if (!span?.data) {
    return [];
  }

  return mappers.get(span).spanAttributes(span);
}

module.exports = {
  extractSpanAttributes
};
