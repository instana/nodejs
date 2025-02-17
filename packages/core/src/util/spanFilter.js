/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// TODO: Refactoring of this function.
// Currently, filtering is based solely on span.data[span.n].operation.
// In the future, additional fields (like operation) may need to be considered for filtering.
// Endpoint configuration for ignoring might also change.

// List of span types to allowed to ignore
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb'];

/**
 * @param {import('../core').InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpoints} endpoints
 * @returns {boolean}
 */
function shouldIgnore(span, endpoints) {
  // Skip if the span type is not in the ignored list
  if (!IGNORABLE_SPAN_TYPES.includes(span.n)) {
    return false;
  }
  const endpoint = endpoints[span.n];
  if (!endpoint) return false;

  // Retrieve the operation(s) from the span data. In some cases, the 'operation' field may be an array.
  // This handles both the cases where 'operation' is a string or an array of strings.

  const operations = Array.isArray(span.data?.[span.n]?.operation)
    ? span.data[span.n].operation
    : [span.data?.[span.n]?.operation];

  if (!operations.length) return false;

  // We support both array and string formats for endpoints, but the string format is not shared publicly.
  if (Array.isArray(endpoint)) {
    return endpoint.some(op =>
      operations.some((/** @type {string} */ operation) => op.toLowerCase() === operation.toLowerCase())
    );
  }

  if (typeof endpoint === 'string') {
    return operations.some((/** @type {string} */ operation) => operation.toLowerCase() === endpoint.toLowerCase());
  }

  return false;
}

/**
 * @param {{ span: import('../core').InstanaBaseSpan, ignoreEndpoints: import('../tracing').IgnoreEndpoints}} params
 * @returns {import('../core').InstanaBaseSpan | null}
 */
function applyFilter({ span, ignoreEndpoints }) {
  if (ignoreEndpoints && shouldIgnore(span, ignoreEndpoints)) {
    return null;
  }
  return span;
}

module.exports = { applyFilter };
