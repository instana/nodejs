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
  if (!fieldMappings[spanName]) return span;

  const mappings = fieldMappings[spanName];
  if (span.data[spanName]) {
    Object.entries(mappings).forEach(([internalField, backendField]) => {
      if (span.data[spanName][internalField]) {
        if (!backendField) {
          // If backendField is falsy, remove the internalField from span data
          delete span.data[spanName][internalField];
        } else {
          span.data[spanName][backendField] = span.data[spanName][internalField];
          delete span.data[spanName][internalField];
        }
      }
    });
  }

  return span;
};
