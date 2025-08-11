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
  if (config?.tracing?.ignoreEndpoints) {
    ignoreEndpoints = config.tracing.ignoreEndpoints;
  }
}

/**
 * @param {import('../util/normalizeConfig').AgentConfig} extraConfig
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
const IGNORABLE_SPAN_TYPES = ['redis', 'dynamodb', 'kafka'];

/**
 * @param {import('../core').InstanaBaseSpan} span
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchEndpoints(span, ignoreconfig) {
  // Parse the endpoints from the span data.
  const spanEndpoints = parseSpanEndpoints(span.data[span.n]?.endpoints);
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
 * @param {import('../tracing').IgnoreEndpointsFields} ignoreconfig
 * @returns {boolean}
 */
function matchConnections(span, ignoreconfig) {
  const spanOperation = span.data[span.n]?.connection?.toLowerCase();
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

  const ignoreConfigs = ignoreEndpointsConfig[span.n];
  if (!ignoreConfigs) {
    return false;
  }

  return ignoreConfigs.some(ignoreconfig => {
    // Advanced filtering:
    // For e.g., for a Kafka, the ignoreconfig like { methods: ['consume'], endpoints: ['t1'] }.
    if (typeof ignoreconfig === 'object') {
      // Case where ignoreconfig does not specify any filtering criteria.
      if (!ignoreconfig.methods && !ignoreconfig.endpoints && !ignoreconfig.connections) {
        return false;
      }

      if (ignoreconfig.methods && !matchMethods(span, ignoreconfig)) {
        return false;
      }
      if (ignoreconfig.endpoints && !matchEndpoints(span, ignoreconfig)) {
        return false;
      }
      if (ignoreconfig.connections && !matchConnections(span, ignoreconfig)) {
        return false;
      }

      // extend more filtering cases in future
      return true;
    }
    return false;
  });
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
