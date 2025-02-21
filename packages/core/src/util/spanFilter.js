/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// List of span types to allowed to ignore
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb'];

/**
 * Determines whether a span should be ignored based on configured filters.
 * Filtering is done based on both `operation` and `endpoints` fields.
 *
 * @param {import('../core').InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpoints} ignoreConfig
 * @returns {boolean}
 */
function shouldIgnore(span, ignoreConfig) {
  // Skip if the span type is not in the ignored list
  if (!IGNORABLE_SPAN_TYPES.includes(span.n)) {
    return false;
  }

  const config = ignoreConfig[span.n];
  if (!config) return false;

  const operation = span.data?.[span.n]?.operation;
  if (!operation) return false;

  const spanEndpoints = Array.isArray(span.data?.[span.n]?.endpoints)
    ? span.data[span.n].endpoints
    : [span.data?.[span.n]?.endpoints].filter(Boolean);

  // @ts-ignore
  return config?.some(rule => {
    if (typeof rule === 'string') {
      return rule.toLowerCase() === operation.toLowerCase();
    }
    // Object based filtering: Requires matching both method and endpoints.
    if (typeof rule === 'object' && rule.endpoints) {
      // If `method` is '*', we only check for endpoint matches.
      const methodMatches = rule.method === '*' || rule.method.toLowerCase() === operation.toLowerCase();

      const ruleEndpoints = Array.isArray(rule.endpoints) ? rule.endpoints : [rule.endpoints];

      const endpointMatches = spanEndpoints.some((/** @type {any} */ endpoint) => ruleEndpoints.includes(endpoint));

      return methodMatches && endpointMatches;
    }

    return false;
  });
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
