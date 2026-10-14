/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { SEVERITY_NUMBERS, SEVERITY_TEXTS, INSTANA_SEVERITY_MAP } = require('./constants');

/**
 * Normalises non-standard log level names to canonical OTel names.
 * e.g. WARNING → WARN, CRITICAL → FATAL
 *
 * @param {string} level
 * @returns {string}
 */
function normalizeLevel(level) {
  const upper = level.toUpperCase();
  if (upper === 'WARNING') return 'WARN';
  if (upper === 'CRITICAL') return 'FATAL';
  return upper;
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {{ stringValue: string } | undefined}
 */
function transformBody(span) {
  const message = span.data?.log?.message;
  if (message === undefined || message === null) return undefined;
  return { stringValue: String(message) };
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {string | undefined}
 */
function transformSeverityText(span) {
  const level = span.data?.log?.level;
  if (level && typeof level === 'string') {
    const normalized = normalizeLevel(level);
    const entry = INSTANA_SEVERITY_MAP[normalized.toLowerCase()];
    return entry ? entry.text : normalized;
  }
  if (span.ec !== undefined) {
    return span.ec > 0 ? SEVERITY_TEXTS.ERROR : SEVERITY_TEXTS.WARN;
  }
  return undefined;
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {number | undefined}
 */
function transformSeverityNumber(span) {
  const level = span.data?.log?.level;
  if (level && typeof level === 'string') {
    const normalized = normalizeLevel(level);
    const entry = INSTANA_SEVERITY_MAP[normalized.toLowerCase()];
    return entry ? entry.number : undefined;
  }
  if (span.ec !== undefined) {
    return span.ec > 0 ? SEVERITY_NUMBERS.ERROR : SEVERITY_NUMBERS.WARN;
  }
  return undefined;
}

/**
 * Zero-pads the 16-character Instana hex trace ID to 32 hex characters (128-bit).
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {string | undefined}
 */
function transformTraceId(span) {
  if (span.t === undefined) return undefined;
  if (!span.t) return '';
  return String(span.t).padStart(32, '0');
}

/**
 * Uses the span's own ID (span.s) as the OTel log record spanId.
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {string | undefined}
 */
function transformSpanId(span) {
  if (span.s === undefined) return undefined;
  if (!span.s) return '';
  return String(span.s).padStart(16, '0');
}

/**
 * Converts span.ts (milliseconds) to nanoseconds by multiplying by 1,000,000.
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {string | undefined}
 */
function transformTimeUnixNano(span) {
  if (span.ts === undefined || span.ts === null) return undefined;
  return String(Number(span.ts) * 1000000);
}

module.exports = {
  normalizeLevel,
  transformBody,
  transformSeverityText,
  transformSeverityNumber,
  transformTraceId,
  transformSpanId,
  transformTimeUnixNano
};
