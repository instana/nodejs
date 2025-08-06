/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * @typedef {Object<string, string>} FieldMapping
 * @typedef {Object<string, FieldMapping>} FieldMappings
 */

/**
 * Field mappings for different span types.
 *
 * This FieldMappings defines how internal span fields are mapped to backend fields
 * for various span types (e.g., dynamodb, redis).
 *
 * As new span types needs to add, simply add their respective mappings
 * following the same format (e.g., 'internal-field': 'backend-field').
 *
 * @type {FieldMappings}
 */
const fieldMappings = {
  dynamodb: {
    /// Maps internal field 'operation' to backend field 'op'
    operation: 'op'
  },
  redis: {
    operation: 'command'
    // connection: connection # already normalized
  },
  kafka: {
    operation: 'access',
    endpoints: 'service'
  },
  http: {
    operation: 'method',
    endpoints: 'url',
    connection: 'host'
  }
};

/**
 * Transforms span data fields to match the backend format.
 *
 * @param {import('../../core').InstanaBaseSpan} span
 * @returns {import('../../core').InstanaBaseSpan} The transformed span.
 */
module.exports.transform = span => {
  const spanName = span.n;
  const mappings = fieldMappings[spanName];
  // If no mappings exist for the span name or the span data, return the original span
  if (!mappings || !span.data[spanName]) return span;

  Object.keys(span.data[spanName]).forEach(internalField => {
    // Only proceed if there's a mapping for the internal field in the current span type
    if (internalField in mappings) {
      const backendField = mappings[internalField];

      if (backendField) {
        span.data[spanName][backendField] = span.data[spanName][internalField];
        delete span.data[spanName][internalField];
      } else {
        // If backendField is falsy, remove the internalField from span data
        delete span.data[spanName][internalField];
      }
    }
  });

  return span;
};
