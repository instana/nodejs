/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { getInstrumentationMappings } = require('./spanAttributes');
const { STATUS_CODES, SPAN_KINDS, INSTRUMENTATION_TYPES } = require('./constants');

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {Object} OTLP
 * @param {Object} [instrumentationMappings] - Pre-computed instrumentation mappings (optional)
 */
function generateSpanName(span, OTLP, instrumentationMappings) {
  const spanType = getSpanType(span);
  const data = getSpanData(span, spanType);
  if (!data) {
    return span?.n || spanType || 'unknown';
  }

  // Use provided mappings or fetch them
  const mappings = instrumentationMappings || getInstrumentationMappings(OTLP);
  const mapping = mappings?.[spanType];
  const generator = mapping?.spanName;
  return generator ? generator(data) : span.n || spanType;
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {Object}
 */
function generateSpanStatus(span) {
  const spanType = getSpanType(span);
  const data = getSpanData(span, spanType);

  const hasFailure = span && span.ec > 0;
  return hasFailure
    ? {
        code: STATUS_CODES.ERROR,
        message: data?.error || `${spanType || 'operation'} failed`
      }
    : {
        code: STATUS_CODES.UNSET
      };
}

/**
 * @param {string} traceId
 */
function convertTraceId(traceId) {
  if (!traceId) return '';
  return String(traceId).padStart(32, '0');
}

/**
 * @param {string} spanId
 */
function convertSpanId(spanId) {
  if (!spanId) return '';
  return String(spanId).padStart(16, '0');
}

/**

 * @param {number|string} tsMs
 * @returns {string}
 */
function convertTimestamp(tsMs) {
  const ms = Number(tsMs);
  return String(ms * 1000000);
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {string}
 */
function generateEndTime(span) {
  // OTLP end time = Instana start time + duration (ms → ns).
  const startMs = span && span.ts !== undefined ? Number(span.ts) : 0;
  const deltaMs = span && span.d !== undefined ? Number(span.d) : 0;
  const endMs = startMs + deltaMs;
  return String(endMs * 1000000);
}

/**
 * @param {number} spanKind
 */
function convertSpanKind(spanKind) {
  if (spanKind === 1) return SPAN_KINDS.SERVER;
  if (spanKind === 2) return SPAN_KINDS.CLIENT;
  if (spanKind === 3) return SPAN_KINDS.INTERNAL;
  return SPAN_KINDS.UNSPECIFIED;
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 */
function getSpanType(span) {
  // special case for otel spans
  if (span?.n === 'otel') {
    return 'otel';
  }

  const keys = Object.keys(span?.data || {});

  return keys.find(key => key !== INSTRUMENTATION_TYPES.PEER && key !== 'resource') || null;
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {string} [type]
 */
function getSpanData(span, type) {
  return type ? span.data?.[type] : null;
}

module.exports = {
  generateSpanName,
  generateSpanStatus,
  convertTraceId,
  convertSpanId,
  convertTimestamp,
  generateEndTime,
  convertSpanKind
};
