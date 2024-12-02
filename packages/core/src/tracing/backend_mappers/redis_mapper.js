/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fieldMappings = {
  // internal-format: backend-format
  operation: 'command'
};

/**
 * Transforms Redis-related span data fields to match the backend format.
 *
 * @param {import('../../core').InstanaBaseSpan} span
 * @returns {import('../../core').InstanaBaseSpan} The transformed span.
 */
function transform(span) {
  if (span.data?.redis) {
    Object.entries(fieldMappings).forEach(([internalField, backendField]) => {
      if (span.data.redis[internalField]) {
        span.data.redis[backendField] = span.data.redis[internalField];
        delete span.data.redis[internalField];
      }
    });
  }

  return span;
}

module.exports = { transform };
