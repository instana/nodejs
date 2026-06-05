/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Span Data Attributes Transformer
 *
 * This module handles the extraction and transformation of span data attributes
 * from Instana spans to OTLP format. It processes the span.data field and applies
 * appropriate mappings based on the span type.
 */

const { applyMappingsForSpanType } = require('../utils/transform-utils');

/**
 * Extracts and converts Instana span data to OTLP attributes
 * Handles multiple data keys (e.g., mongo + peer)
 * Stores the primary span type as metadata for later use
 * @param {Object} instanaSpan - The Instana span object
 * @returns {Array} Array of OTLP attributes
 */
function extractSpanDataAttributes(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) {
    return [];
  }

  const allAttributes = [];
  const dataKeys = Object.keys(instanaSpan.data);

  // Store the first significant span type (excluding 'peer' which is supplementary)
  // This will be used by generateSpanName and generateSpanStatus
  if (!instanaSpan._span_type && dataKeys.length > 0) {
    // Prefer non-peer keys as the primary span type
    instanaSpan._span_type = dataKeys.find(key => key !== 'peer') || dataKeys[0];
  }

  // Process each data key
  Object.entries(instanaSpan.data).forEach(([spanType, spanData]) => {
    const attributes = applyMappingsForSpanType(spanType, spanData);
    allAttributes.push(...attributes);
  });

  return allAttributes;
}

module.exports = {
  extractSpanDataAttributes
};

// Made with Bob
