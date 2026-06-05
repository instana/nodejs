/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Meta Attributes Transformer
 *
 * This module handles the extraction and transformation of metadata attributes
 * from Instana spans to OTLP format. This includes base fields like span IDs,
 * timestamps, span kind, name, and status.
 */

const { METADATA_MAPPINGS } = require('../mappers');
const { generateSpanName, generateSpanStatus } = require('../utils/transform-utils');

/**
 * Applies metadata transformations to convert Instana base fields to OTLP
 * @param {Object} instanaSpan - The Instana span object
 * @returns {Object} Object containing OTLP metadata fields
 */
function extractMetaAttributes(instanaSpan) {
  const result = {};

  // Map of getter function names to actual functions
  const getterFunctions = {
    generateSpanName,
    generateSpanStatus
  };

  Object.entries(METADATA_MAPPINGS).forEach(([instanaField, mapping]) => {
    // Handle getter-based mappings (functions that need full span context)
    if (mapping.getter) {
      const getterFn = typeof mapping.getter === 'string' ? getterFunctions[mapping.getter] : mapping.getter;
      if (getterFn) {
        const value = getterFn(instanaSpan);
        if (value !== null && value !== undefined) {
          result[mapping.otlp] = value;
        }
      }
      return;
    }

    const instanaValue = instanaSpan[instanaField];

    // Skip if field doesn't exist (except optional parent)
    if (instanaValue === undefined) {
      if (instanaField === 'p') return; // Parent is optional
      return;
    }

    // Apply transformation
    if (mapping.transform) {
      const transformedValue = mapping.transform(instanaValue);
      if (transformedValue !== null && transformedValue !== undefined) {
        result[mapping.otlp] = transformedValue;
      }
    }
  });

  return result;
}

module.exports = {
  extractMetaAttributes
};

// Made with Bob
