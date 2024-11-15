/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// Configuration for Redis-specific field mappings for BE
const fieldMappings = {
  operation: 'command'
};

/**
 * Transform the span object by renaming the Redis fields based on defined mappings.
 *
 * @param {Object} span - The span object containing Redis data to transform.
 * @param {boolean} log - Flag to enable/disable logging of transformations.
 * @returns {Object} - The transformed span object.
 */
function transform(span) {
  if (span.data?.redis) {
    Object.entries(fieldMappings).forEach(([oldKey, newKey]) => {
      if (span.data.redis[oldKey]) {
        span.data.redis[newKey] = span.data.redis[oldKey];
        delete span.data.redis[oldKey];
      }
    });
  }

  return span;
}

module.exports = { transform };
