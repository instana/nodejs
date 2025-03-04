/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * @type {import('../tracing').IgnoreEndpoints}
 */
let ignoreEndpoints;

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 */
function init(config) {
  ignoreEndpoints = config?.tracing?.ignoreEndpoints;
}

/**
 * @param {import('../util/normalizeConfig').AgentConfig} extraConfig
 */
function activate(extraConfig) {
  if (extraConfig?.tracing?.ignoreEndpoints) {
    ignoreEndpoints = extraConfig.tracing.ignoreEndpoints;
  }
}

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

  // The endpoint already been converted to lowercase during parsing, so here we are normalizing
  // the operation for case-insensitive comparison
  const operation = span.data?.[span.n]?.operation?.toLowerCase();
  if (!operation) return false;

  // We support both array and string formats for endpoints, but the string format is not shared publicly.
  if (Array.isArray(endpoint)) {
    return endpoint.some(op => op.toLowerCase() === operation);
  }

  if (typeof endpoint === 'string') {
    return endpoint.toLowerCase() === operation;
  }

  return false;
}

/**
 * @param {import('../core').InstanaBaseSpan} span
 * @returns {import('../core').InstanaBaseSpan | null}
 */
function applyFilter(span) {
  if (ignoreEndpoints && shouldIgnore(span, ignoreEndpoints)) {
    return null;
  }
  return span;
}

module.exports = { applyFilter, activate, init };
