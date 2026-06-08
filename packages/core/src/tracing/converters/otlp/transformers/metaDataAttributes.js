/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { DIRECT_MAPPINGS, COMPUTED_MAPPINGS } = require('../mappers/metaData');

/**
 * Applies metadata transformations to convert Instana base fields to OTLP
 * @param {Object} instanaSpan - The raw Instana span object
 * @returns {Object} Target OTLP metadata dictionary fields
 */
function extractMetaDataAttributes(instanaSpan) {
  if (!instanaSpan) return {};

  const result = {};

  // Step 1: Optimized direct field extraction via fast key lookup (No sub-array allocations)
  Object.keys(DIRECT_MAPPINGS).forEach(field => {
    const value = instanaSpan[field];
    if (value === undefined) return;

    const mapping = DIRECT_MAPPINGS[field];
    result[mapping.otlp] = typeof mapping.transform === 'function' ? mapping.transform(value) : value;
  });

  // Step 2: Computed fields utilizing direct function pointers
  COMPUTED_MAPPINGS.forEach(mapping => {
    if (typeof mapping.compute === 'function') {
      const value = mapping.compute(instanaSpan);

      if (value !== null && value !== undefined) {
        result[mapping.otlp] = value;
      }
    }
  });

  return result;
}

module.exports = {
  extractMetaDataAttributes: extractMetaDataAttributes
};
