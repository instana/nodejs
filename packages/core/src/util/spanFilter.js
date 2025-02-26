/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// List of span types to allowed to ignore
// 'kafka_placeholder' used as a temporary span type for Kafka until the support is implemented.
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka_placeholder'];

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpointConfig} config
 * @returns {boolean}
 */
function matchEndpoints(span, config) {
  const spanEndpoints = Array.isArray(span.data[span.n]?.endpoints)
    ? span.data[span.n].endpoints
    : [span.data[span.n]?.endpoints].filter(Boolean);

  if (!spanEndpoints.length) {
    return false;
  }

  const configuredEndpoints = Array.isArray(config.endpoints) ? config.endpoints : [config.endpoints];

  // If * is present, any endpoint will match.
  if (configuredEndpoints.includes('*')) {
    return true;
  }

  return spanEndpoints.some((/** @type {string} */ endpoint) =>
    configuredEndpoints.some((/** @type {string} */ e) => e?.toLowerCase() === endpoint?.toLowerCase())
  );
}

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpointConfig} config
 * @returns {boolean}
 */
function matchMethods(span, config) {
  const spanOperation = span.data[span.n]?.operation?.toLowerCase();
  let methodMatches = false;

  if (config.methods) {
    if (Array.isArray(config.methods)) {
      methodMatches = config.methods.includes('*') || config.methods.some(m => m?.toLowerCase() === spanOperation);
    } else if (typeof config.methods === 'string') {
      methodMatches = config.methods === '*' || config.methods.toLowerCase() === spanOperation;
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
  if (!IGNORABLE_SPAN_TYPES.includes(span.n)) {
    return false;
  }

  const ignoreConfigs = ignoreEndpointsConfig[span.n];
  if (!ignoreConfigs) {
    return false;
  }
  const spanOperation = span.data[span.n]?.operation?.toLowerCase();
  // For basic filtering: when the configuration is provided as a simple string
  // (e.g., "redis.get" or "dynamodb.query"), directly compare it to the span's operation.
  if (typeof ignoreConfigs === 'string') {
    return ignoreConfigs.toLowerCase() === spanOperation;
  }

  return ignoreConfigs.some(config => {
    // For basic filtering: when the configuration is provided as a simple string array
    // (e.g., "redis:['get,'set']"
    if (typeof config === 'string') {
      return config.toLowerCase() === spanOperation;
    }

    // For advanced filtering: the config is provided as an object.
    // For instance, for a Kafka, the config like { methods: ['consume'], endpoints: ['t1'] }.
    if (typeof config === 'object') {
      // Case where config does not specify any filtering criteria.
      if (!config.methods && !config.endpoints) {
        return false;
      }

      if (config.methods && !matchMethods(span, config)) {
        return false;
      }
      if (config.endpoints && !matchEndpoints(span, config)) {
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
