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
  //  In most cases, `span.n` matches the key inside `span.data` (e.g., `span.n === 'redis'` → `span.data.redis`).
  //  However, there are exceptions where `span.n` represents a higher-level concept or protocol,
  //  while `span.data` contains one or more lower-level components.
  //  For example:
  //  For `span.n === 'node.http.server'` or 'node.http.client', the actual data is under `span.data.http`.
  //  In the case of `span.n === 'graphql.server'`, the span includes both GraphQL-specific and HTTP data,
  //  so `span.data` may contain both `graphql` and `http` keys simultaneously.
  Object.keys(span.data).forEach(key => {
    const mappings = fieldMappings[key];
    if (!mappings) return;

    applyMappings(span.data[key], mappings);
  });

  return span;
};

/**
 * Applies field mappings to a specific data section.
 *
 * @param {Record<string, any>} dataSection - The span data object to transform.
 * @param {FieldMapping} mappings - The field mapping rules to apply.
 */
function applyMappings(dataSection, mappings) {
  Object.keys(dataSection).forEach(internalField => {
    if (internalField in mappings) {
      const backendField = mappings[internalField];
      if (backendField) {
        dataSection[backendField] = dataSection[internalField];
      }
      delete dataSection[internalField];
    }
  });
}
