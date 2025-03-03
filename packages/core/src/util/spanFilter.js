/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// List of span types to allowed to ignore
// 'kafka_placeholder' used as a temporary span type for testing, until the Kafka support is implemented.
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka_placeholder'];

/**
 * @param {import('../core').InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchEndpoints(span, ignoreconfig) {
  // TODO:
  // Normalizing the endpoints will be addressed in future PRs.
  // For Kafka span data, the endpoints correspond to the service field,
  // which may contain multiple values.
  const spanEndpoints = Array.isArray(span.data[span.n]?.endpoints)
    ? span.data[span.n].endpoints
    : [span.data[span.n]?.endpoints].filter(Boolean);

  if (!spanEndpoints.length) {
    return false;
  }

  // If * is present, any endpoint will match.
  if (ignoreconfig.endpoints.includes('*')) {
    return true;
  }

  return spanEndpoints.some((/** @type {string} */ endpoint) =>
    ignoreconfig.endpoints.some(e => e?.toLowerCase() === endpoint?.toLowerCase())
  );
}

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchMethods(span, ignoreconfig) {
  const spanOperation = span.data[span.n]?.operation?.toLowerCase();
  let methodMatches = false;

  if (ignoreconfig.methods) {
    if (Array.isArray(ignoreconfig.methods)) {
      methodMatches =
        ignoreconfig.methods.includes('*') || ignoreconfig.methods.some(m => m?.toLowerCase() === spanOperation);
    }
  }

  return methodMatches;
}

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpoints} ignoreEndpointsConfig
 * @returns {boolean}
 */
function shouldIgnore(span, ignoreEndpointsConfig) {
  // Skip if the span type is not in the ignored list
  if (!IGNORABLE_SPAN_TYPES.includes(span.n)) {
    return false;
  }

  const ignoreConfigs = ignoreEndpointsConfig[span.n];
  if (!ignoreConfigs) {
    return false;
  }

  return ignoreConfigs.some(ignoreconfig => {
    // Advanced filtering:
    // For e.g., for a Kafka, the ignoreconfig like { methods: ['consume'], endpoints: ['t1'] }.
    if (typeof ignoreconfig === 'object') {
      // Case where ignoreconfig does not specify any filtering criteria.
      if (!ignoreconfig.methods && !ignoreconfig.endpoints) {
        return false;
      }

      if (ignoreconfig.methods && !matchMethods(span, ignoreconfig)) {
        return false;
      }
      if (ignoreconfig.endpoints && !matchEndpoints(span, ignoreconfig)) {
        return false;
      }
      // extend more filtering cases in future
      return true;
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
