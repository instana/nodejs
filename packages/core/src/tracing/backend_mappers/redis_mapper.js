/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// Configuration for Redis-specific field mappings for BE
const fieldMappings = {
  operation: 'command'
};

/**
 * @param {Object} span
 * @returns {Object}
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
