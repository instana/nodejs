/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {Object} metadataMappings
 * @returns {Object}
 */
function extractSpanMetadata(span, metadataMappings) {
  if (!span) return {};

  const { directMappings, computedMappings } = metadataMappings;

  const result = Object.keys(directMappings).reduce((acc, field) => {
    const value = span[field];

    if (value !== undefined) {
      const mapping = directMappings[field];
      acc[mapping.otlp] = typeof mapping.transform === 'function' ? mapping.transform(value, span) : value;
    }

    return acc;
  }, {});

  computedMappings.forEach(mapping => {
    if (typeof mapping.compute === 'function') {
      const value = mapping.compute(span);

      if (value !== null && value !== undefined) {
        result[mapping.otlp] = value;
      }
    }
  });

  return result;
}

module.exports = {
  extractSpanMetadata
};
