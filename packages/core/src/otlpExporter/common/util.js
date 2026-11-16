/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {any} traceId
 * @returns {string}
 */
function toTraceId(traceId) {
  return traceId ? String(traceId).padStart(32, '0') : '';
}

/**
 * @param {any} spanId
 * @returns {string}
 */
function toSpanId(spanId) {
  return spanId ? String(spanId).padStart(16, '0') : '';
}

/**
 * Converts epoch milliseconds to an epoch nanoseconds string.
 * @param {any} ms
 * @returns {string}
 */
function toTimeUnixNano(ms) {
  return String(Number(ms) * 1000000);
}

module.exports = {
  toTraceId,
  toSpanId,
  toTimeUnixNano
};
