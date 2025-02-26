/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// List of span types to allowed to ignore
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka'];

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {string | string []} config
 * @returns {boolean}
 */
function matchOperation(span, config) {
  const spanOperation = span.data[span.n]?.operation?.toLowerCase();
  if (!spanOperation) {
    return false;
  }

  if (typeof config === 'string') {
    return config.toLowerCase() === spanOperation;
  }

  if (Array.isArray(config)) {
    return config.some(op => typeof op === 'string' && op?.toLowerCase() === spanOperation);
  }

  return false;
}

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpointConfig} config
 * @returns {boolean}
 */
function matchEndpoints(span, config) {
  const rawEndpoints = span.data[span.n]?.endpoints;
  const spanEndpoints = Array.isArray(rawEndpoints) ? rawEndpoints : [rawEndpoints].filter(Boolean);

  if (!spanEndpoints.length) {
    return false;
  }

  const configuredEndpoints = Array.isArray(config.endpoints) ? config.endpoints : [config.endpoints];

  // If * is present, any endpoint will match.
  if (configuredEndpoints.includes('*')) {
    return true;
  }

  return spanEndpoints.some(endpoint =>
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
  // For basic filtering: when the configuration is provided as a simple string
  // (e.g., "redis.get" or "dynamodb.query"), directly compare it to the span's operation.
  if (typeof ignoreConfigs === 'string') {
    return matchOperation(span, ignoreConfigs);
  }

  return ignoreConfigs.some(config => {
    // For basic filtering: when the configuration is provided as a simple string array
    // (e.g., "redis:['get,'set']"
    if (typeof config === 'string') {
      return matchOperation(span, config);
    }
    // For advanced filtering: the configuration is provided as an object.
    // For instance, for a Kafka span, the configuration like { methods: ['consume'], endpoints: ['t1'] }.
    if (typeof config === 'object') {
      if (config.methods && !matchMethods(span, config)) {
        return false;
      }
      if (config.endpoints && !matchEndpoints(span, config)) {
        return false;
      }
      // extend the cases in future
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
