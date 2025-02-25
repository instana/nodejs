/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// List of span types to allowed to ignore
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka'];

/**
 * Determines whether a span should be ignored based on configured filters.
 * Filtering is done based on both `operation` and `endpoints` fields.
 *
 * @param {import('../core').InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpoints} ignoreEndpoints
 * @returns {boolean}
 */
function shouldIgnore(span, ignoreEndpoints) {
  // Skip if the span type is not in the ignored list
  if (!IGNORABLE_SPAN_TYPES.includes(span.n)) return false;
  const ignoreConfigs = ignoreEndpoints[span.n];
  if (!ignoreConfigs) return false;

  const operation = span.data[span.n]?.operation;
  if (!operation) return false;

  const spanEndpoints = Array.isArray(span.data[span.n]?.endpoints)
    ? span.data[span.n].endpoints
    : [span.data[span.n]?.endpoints].filter(Boolean);

  // We support string, array, object formats for endpoints, but the string format is not shared publicly.
  // If the ignoreConfigs is a simple string, compare it with the operation (case-insensitively).
  if (typeof ignoreConfigs === 'string') {
    return ignoreConfigs?.toLowerCase() === operation?.toLowerCase();
  }

  return ignoreConfigs.some(config => {
    if (typeof config === 'string') {
      return config?.toLowerCase() === operation?.toLowerCase();
    }

    if (typeof config === 'object' && config) {
      let methodMatches = false;
      if (config.method) {
        // If method is an array, check if any entry (or a '*' wildcard) matches the operation.
        if (Array.isArray(config.method)) {
          if (config.method.includes('*')) {
            methodMatches = true;
          } else {
            methodMatches = config.method.some(
              (/** @type {string} */ m) => m?.toLowerCase() === operation?.toLowerCase()
            );
          }
        } else if (typeof config.method === 'string') {
          methodMatches = config.method === '*' || config?.method?.toLowerCase() === operation?.toLowerCase();
        }
      }

      if (!methodMatches) return false;

      if (!spanEndpoints.length) return false;
      let ruleEndpoints = config.endpoints;
      ruleEndpoints = Array.isArray(ruleEndpoints) ? ruleEndpoints : [ruleEndpoints];

      return spanEndpoints.some((/** @type {string} */ ep) => ruleEndpoints.includes(ep));
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
