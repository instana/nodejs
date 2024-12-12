/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fieldMappings = {
  // internal-format: backend-format
  operation: 'op'
};

/**
 * Transforms dynamodb-related span data fields to match the backend format.
 *
 * @param {import('../../core').InstanaBaseSpan} span
 * @returns {import('../../core').InstanaBaseSpan} The transformed span.
 */
module.exports.transform = span => {
  if (span.data?.dynamodb) {
    Object.entries(fieldMappings).forEach(([internalField, backendField]) => {
      if (span.data.dynamodb[internalField]) {
        span.data.dynamodb[backendField] = span.data.dynamodb[internalField];
        delete span.data.dynamodb[internalField];
      }
    });
  }

  return span;
};
