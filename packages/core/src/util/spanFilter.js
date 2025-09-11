/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * @type {import('../tracing').IgnoreEndpoints}
 */
let ignoreEndpoints;

/**
 * @param {import('../config').InstanaConfig} config
 */
function init(config) {
  if (config?.tracing?.ignoreEndpoints) {
    ignoreEndpoints = config.tracing.ignoreEndpoints;
  }
}

/**
 * @param {import('../config').AgentConfig} extraConfig
 */
function activate(extraConfig) {
  /**
   * Configuration priority order:
   * 1. In-code configuration
   * 2. Environment variables:
   *    - `INSTANA_IGNORE_ENDPOINTS_PATH`
   *    - `INSTANA_IGNORE_ENDPOINTS`
   * 3. Agent configuration (loaded later)
   *
   * Since the agent configuration is loaded later, we first check
   * that `ignoreEndpoints` MUST be empty. If yes, we
   * are allowed to fall back to the agent's configuration (`extraConfig.tracing.ignoreEndpoints`).
   *
   * TODO: Perform a major refactoring of configuration priority ordering in INSTA-817.
   */
  const isIgnoreEndpointsEmpty = !ignoreEndpoints || Object.keys(ignoreEndpoints).length === 0;
  if (isIgnoreEndpointsEmpty && extraConfig?.tracing?.ignoreEndpoints) {
    ignoreEndpoints = extraConfig.tracing.ignoreEndpoints;
  }
}

// List of span types to allowed to ignore
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka', 'node.http.server'];

/**
 * @param {import('../core').InstanaBaseSpan} span
 * @param {string} spanTypeKey
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchEndpoints(span, spanTypeKey, ignoreconfig) {
  // Parse the endpoints from the span data.
  const spanEndpoints = parseSpanEndpoints(span.data[spanTypeKey]?.endpoints);
  if (!spanEndpoints.length) {
    return false;
  }

  // If * is present, any endpoint will match.
  if (ignoreconfig.endpoints.includes('*')) {
    return true;
  }
  /**
   * General rules:
   * 1. If every endpoint in the span is present in `ignoreconfig.endpoints`, the span is ignored.
   * 2. If at least one endpoint is not in the ignored list, the span is traced.
   *    This ensures that partial matches do not cause unintended ignores in batch operations.
   *
   * Case 1: Single Endpoint (General Case)
   * - Normally, a span contains only one endpoint, which is represented as an array with a single value.
   * - If this endpoint exists in `ignoreconfig.endpoints`, the span is ignored.
   * - Otherwise, the span is traced as usual.
   *
   * Case 2: Batch Processing in Kafka (`sendBatch`)
   * - In Kafka, the `sendBatch` operation allows sending messages to multiple topics in a single request.
   * - A single span is generated for the batch operation, attaching all topic names as a comma-separated list.
   * - If all topics in the batch appear in `ignoreconfig.endpoints`, the span is ignored.
   * - If at least one topic is not ignored, the span remains traced, ensuring visibility where needed.
   */
  return spanEndpoints.every((/** @type {string} */ endpoint) =>
    ignoreconfig.endpoints.some(e => e?.toLowerCase() === endpoint?.toLowerCase())
  );
}

/**
 * @param {import("../core").InstanaBaseSpan} span
 * @param {string} spanTypeKey
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchMethods(span, spanTypeKey, ignoreconfig) {
  const spanOperation = span.data[spanTypeKey]?.operation?.toLowerCase();
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
 * @param {string} spanTypeKey
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchConnections(span, spanTypeKey, ignoreconfig) {
  const spanOperation = span.data[spanTypeKey]?.connection?.toLowerCase();
  let connectionMatches = false;

  if (ignoreconfig.connections) {
    if (Array.isArray(ignoreconfig.connections)) {
      connectionMatches =
        ignoreconfig.connections.includes('*') ||
        ignoreconfig.connections.some(c => spanOperation.indexOf(c?.toLowerCase()) !== -1);
    }
  }

  return connectionMatches;
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

  const spanTypeKey = normalizeSpanDataTypeKey(span.n);
  if (!spanTypeKey) {
    return false;
  }

  const ignoreConfigs = ignoreEndpointsConfig[spanTypeKey];
  if (!ignoreConfigs || !Array.isArray(ignoreConfigs)) {
    return false;
  }

  return ignoreConfigs.some(ignoreconfig => {
    if (typeof ignoreconfig !== 'object') return false;

    let matched = false;

    if (ignoreconfig.methods) {
      if (!matchMethods(span, spanTypeKey, ignoreconfig)) return false;
      matched = true;
    }

    if (ignoreconfig.endpoints) {
      if (!matchEndpoints(span, spanTypeKey, ignoreconfig)) return false;
      matched = true;
    }

    if (ignoreconfig.connections) {
      if (!matchConnections(span, spanTypeKey, ignoreconfig)) return false;
      matched = true;
    }

    // extend more filtering cases in future
    return matched;
  });
}

/**
 * Normalizes the configuration key for a given span type.
 *
 * For the span name 'node.http.server', this function returns 'http'
 * to ensure consistent field mapping.
 *
 * Note: The 'node.http.client' span type is intentionally not normalized here
 * because client-side HTTP spans are currently excluded from this normalization logic.
 * This can be updated in the future if HTTP exit filtering is required.
 *
 * All other span types are returned unchanged.
 *
 * @param {string} spanType - The span name (e.g., span.n).
 * @returns {string} - The normalized span type key.
 */
function normalizeSpanDataTypeKey(spanType) {
  switch (spanType) {
    case 'node.http.server':
      return 'http';
    default:
      return spanType;
  }
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

/**
 * Parses the endpoints field in span data.
 *
 * Case 1: In general, endpoints is a string representing a single endpoint in span.data.
 *         We convert it into an array.
 * Case 2: In some cases (e.g., Kafka batch produce), endpoints is a comma-separated string
 *         (e.g., `"test-topic-1,test-topic-2"`). We split it into an array.
 * Case 3: If endpoints is an array(future cases). In this case, we return it as-is
 *         since filtering logic expects an array internally.
 *
 * For filtering, endpoints in span always treated as an array,
 *
 * @param {string} endpoints
 */
function parseSpanEndpoints(endpoints) {
  if (typeof endpoints === 'string') {
    return endpoints.split(',').map(endpoint => endpoint.trim());
  }

  if (Array.isArray(endpoints)) {
    return endpoints;
  }

  return [];
}

module.exports = { applyFilter, activate, init, shouldIgnore };
