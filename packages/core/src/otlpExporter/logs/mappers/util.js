/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { SEVERITY_NUMBERS } = require('./constants');

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
 * @param {any} ms
 * @returns {string | undefined}
 */
function toTimeUnixNano(ms) {
  return String(Number(ms) * 1000000);
}

/**
 * @param {any} message
 * @returns {{ stringValue: string } | undefined}
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
  if (level && String(level).trim() !== '') {
    return String(level);
  }
  return undefined;
}

/**
 * @param {any} level
 * @returns {number | undefined}
 */
function toSeverityNumber(level) {
  if (level && String(level).trim() !== '') {
    const normalized = normalizeLevel(level);
    return normalized ? SEVERITY_NUMBERS.get(normalized) : undefined;
  }
  return undefined;
}

module.exports = {
  toTraceId,
  toSpanId,
  toTimeUnixNano,
  toBody,
  toSeverityText,
  toSeverityNumber
};
