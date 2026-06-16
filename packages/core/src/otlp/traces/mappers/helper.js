/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { STATUS_CODES, SPAN_KINDS, INSTRUMENTATION_TYPES } = require('./constants');

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {Object} instrumentationMappings
 */
function generateSpanName(span, instrumentationMappings) {
  const spanType = getSpanType(span);
  const data = getSpanData(span, spanType);
  if (!data) {
    return span?.n || spanType || 'unknown';
  }

  const mapping = instrumentationMappings?.[spanType];
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
 */
function convertTimestampToUnixNano(tsMs) {
  const ms = Number(tsMs);

  if (!Number.isFinite(ms)) {
    return undefined;
  }

  return String(ms * 1_000_000);
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 */
function computeEndTimeUnixNano(span) {
  const startMs = Number(span?.ts);
  // OTLP end time = Instana start time + duration (ms → ns).
  const durationMs = Number(span?.d);

  if (!Number.isFinite(startMs) || !Number.isFinite(durationMs)) {
    return undefined;
  }

  return String((startMs + durationMs) * 1_000_000);
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
  convertTimestampToUnixNano,
  computeEndTimeUnixNano,
  convertSpanKind
};
