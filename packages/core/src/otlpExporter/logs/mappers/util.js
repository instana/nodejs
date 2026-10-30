/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { SEVERITY_NUMBERS, SEVERITY_NUMBER_UNKNOWN } = require('./constants');

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
 * Converts milliseconds to nanoseconds.
 *
 * @param {any} ms
 * @returns {string}
 */
function toTimeUnixNano(ms) {
  return String(Number(ms) * 1000000);
}

/**
 * @param {any} message
 * @returns {{ stringValue: string }}
 */
function toBody(message) {
  return { stringValue: String(message) };
}

/**
 * @param {any} level
 * @returns {string | undefined}
 */
function normalizeLevel(level) {
  const normalized = String(level).trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}

/**
 * @param {any} level
 * @returns {string | undefined}
 */
function toSeverityText(level) {
  return String(level).trim() === '' ? undefined : String(level);
}

/**
 * @param {any} level
 * @returns {number | undefined}
 */
function toSeverityNumber(level) {
  const normalized = normalizeLevel(level);
  if (normalized === undefined) {
    return undefined;
  }
  const severityNumber = SEVERITY_NUMBERS.get(normalized);
  return severityNumber === undefined ? SEVERITY_NUMBER_UNKNOWN : severityNumber;
}

module.exports = {
  toTraceId,
  toSpanId,
  toTimeUnixNano,
  toBody,
  toSeverityText,
  toSeverityNumber
};
