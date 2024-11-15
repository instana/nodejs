/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// TODO: read from config
// @ts-ignore
let config;

/**
 * To check whether a span should be ignored based on the command.
 *
 * @param {import('../core').InstanaBaseSpan} span - The span object to check.
 * @returns {boolean} - Returns true if the span should be ignored, false otherwise.
 */
function shouldIgnore(span) {
  // @ts-ignore
  const ignoreEndpoints = config.tracing.ignoreEndpoints[span.n];

  // @ts-ignore
  if (span.data?.[span.n]?.command && ignoreEndpoints) {
    return ignoreEndpoints.includes(span.data[span.n].command);
  }

  return false;
}

/**
 * @param {Object} span - The span object to check.
 * @returns {Object|null} - Returns the span if not ignored, or null if the span should be ignored.
 */
function filterSpan(span, configuration = {}) {
  // @ts-ignore
  config = configuration || config;
  if (config?.tracing?.ignoreEndpoints && shouldIgnore(span)) {
    return null;
  }
  return span;
}

module.exports = { filterSpan };
