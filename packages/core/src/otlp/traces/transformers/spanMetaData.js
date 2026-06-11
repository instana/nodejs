/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { getMetadataMappings } = require('../mappers/spanMetaData');

/**
 * Applies metadata transformations to convert Instana base fields to OTLP format
 * @param {Object} instanaSpan
 * @returns {Object}
 */
function extractSpanMetadata(instanaSpan) {
  if (!instanaSpan) return {};

  const OTLP = ctx.semConv;
  const { directMappings, computedMappings } = getMetadataMappings(OTLP);

  const result = Object.keys(directMappings).reduce((acc, field) => {
    const value = instanaSpan[field];

    if (value !== undefined) {
      const mapping = directMappings[field];
      acc[mapping.otlp] = typeof mapping.transform === 'function' ? mapping.transform(value, instanaSpan) : value;
    }

    return acc;
  }, {});

  computedMappings.forEach(mapping => {
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
  extractSpanMetadata
};
