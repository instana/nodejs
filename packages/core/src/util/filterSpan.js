/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * To check whether a span should be ignored based on the command.
 *
 * @param {import('../core').InstanaBaseSpan} span - The span object to check.
 * @param {Array<string>} ignoreEndpoints - An array of endpoints to ignore.
 * @returns {boolean} - Returns true if the span should be ignored, false otherwise.
 */
function shouldIgnore(span, ignoreEndpoints) {
  if (span.data?.[span.n]?.operation && ignoreEndpoints) {
    return ignoreEndpoints.includes(span.data[span.n].operation);
  }

  return false;
}

/**
 * Filters a span based on ignore criteria.
 *
 * @param {{ span: import('../core').InstanaBaseSpan, ignoreEndpoints: { [key: string]: Array<string> } }} params
 * @returns {import('../core').InstanaBaseSpan | null}
 */
function filterSpan({ span, ignoreEndpoints }) {
  if (ignoreEndpoints && shouldIgnore(span, ignoreEndpoints[span.n])) {
    return null;
  }
  return span;
}

module.exports = { filterSpan };
