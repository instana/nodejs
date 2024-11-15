/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/** @type {import('../core').GenericLogger} */
let logger;
logger = require('../logger').getLogger('tracing/util/filterSpan', newLogger => {
  logger = newLogger;
});
/**
 * @param {import('../core').InstanaBaseSpan} span
 * @param {Array<string>} ignoreEndpoints
 * @returns {boolean}
 */
function shouldIgnore(span, ignoreEndpoints) {
  if (span.data?.[span.n]?.operation && ignoreEndpoints) {
    return ignoreEndpoints.includes(span.data[span.n].operation);
  }

  return false;
}

/**
 * @param {{ span: import('../core').InstanaBaseSpan, ignoreEndpoints: { [key: string]: Array<string> } }} params
 * @returns {import('../core').InstanaBaseSpan | null}
 */
function filterSpan({ span, ignoreEndpoints }) {
  if (ignoreEndpoints && shouldIgnore(span, ignoreEndpoints[span.n])) {
    logger.debug('Span ignored due to matching ignore endpoint', {
      spanType: span.n,
      ignoredOperation: span.data[span.n]?.operation
    });
    return null;
  }
  return span;
}

module.exports = { filterSpan };
