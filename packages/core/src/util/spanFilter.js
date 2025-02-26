/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// List of span types to allowed to ignore
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka'];

/**
 *
 * @param {import('../core').InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpoints} ignoreEndpointsConfig
 * @returns {boolean}
 */
function shouldIgnore(span, ignoreEndpointsConfig) {
  // Skip if the span type is not in the ignored list
  if (!IGNORABLE_SPAN_TYPES.includes(span.n)) {
    return false;
  }

  const ignoreConfigs = ignoreEndpointsConfig[span.n];
  if (!ignoreConfigs) return false;

  const operation = span.data[span.n]?.operation;

  const endpoints = Array.isArray(span.data[span.n]?.endpoints)
    ? span.data[span.n].endpoints
    : [span.data[span.n]?.endpoints].filter(Boolean);

  if (!operation && !endpoints.legth) {
    return false;
  }

  // We support string, array, object formats for the config, but the string format is not shared publicly.
  // If the ignoreConfigs is a simple string, compare it with the operation.
  if (typeof ignoreConfigs === 'string') {
    return ignoreConfigs?.toLowerCase() === operation?.toLowerCase();
  }

  return ignoreConfigs.some(config => {
    if (typeof config === 'string') {
      return config?.toLowerCase() === operation?.toLowerCase();
    }

    // If the config is an object, proceed with methods and endpoints checks.
    if (typeof config === 'object' && config) {
      let methodMatches = false;
      if (config.methods) {
        if (Array.isArray(config.methods)) {
          methodMatches =
            config.methods.includes('*') || config.methods.some(m => m?.toLowerCase() === operation?.toLowerCase());
        } else if (typeof config.methods === 'string') {
          methodMatches = config.methods === '*' || config.methods?.toLowerCase() === operation?.toLowerCase();
        }
      }

      if (!methodMatches) return false;

      const configuredEndpoints = Array.isArray(config.endpoints) ? config.endpoints : [config.endpoints];

      // If the config endpoints include the '*', then ignore endpoint matching completely.
      // This means, for example, if the method is "consume", all endpoints(topics) with that operation will be ignored.
      if (configuredEndpoints.includes('*')) {
        return true;
      }
      return endpoints.some((/** @type {string} */ endpoint) => configuredEndpoints.includes(endpoint));
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
