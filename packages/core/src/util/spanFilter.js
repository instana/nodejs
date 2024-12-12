/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

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

  const operation = span.data?.[span.n]?.operation?.toLowerCase();
  if (!operation) return false;

  if (Array.isArray(endpoint)) {
    return endpoint.some(op => op.toLowerCase() === operation);
  }

  if (typeof endpoint === 'string') {
    return endpoint.toLowerCase() === operation;
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
