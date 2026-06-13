/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { STATUS_CODES, SPAN_KINDS } = require('../constants');
const { getSpanType, getSpanData } = require('./spanUtil');
const { getInstrumentationMappings } = require('./spanAttributes');

/**
 * @param {Object} instanaSpan
 * @param {Object} OTLP - Semantic convention mappings
 * @returns {string} Evaluated name string
 */
function generateSpanName(instanaSpan, OTLP) {
  const spanType = getSpanType(instanaSpan);
  const data = getSpanData(instanaSpan, spanType);
  if (!data) {
    return instanaSpan?.n || spanType || 'unknown';
  }

  const instrumentationMappings = getInstrumentationMappings(OTLP);
  const mapping = instrumentationMappings?.[spanType];
  const generator = mapping?.spanName;
  return generator ? generator(data) : instanaSpan.n || spanType;
}

/**
 * @param {Object} instanaSpan
 * @returns {Object}
 */
function generateSpanStatus(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = getSpanData(instanaSpan, spanType);

  const hasFailure = instanaSpan && instanaSpan.ec > 0;
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
 * @param {any} instanaTraceId
 */
function convertTraceId(instanaTraceId) {
  if (!instanaTraceId) return '';
  return String(instanaTraceId).padStart(32, '0');
}

/**
 * @param {any} instanaSpanId
 */
function convertSpanId(instanaSpanId) {
  if (!instanaSpanId) return '';
  return String(instanaSpanId).padStart(16, '0');
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
 * Contextual end time translation mapping (d -> END_TIME_UNIX_NANO)
 * @param {Object} instanaSpan
 * @returns {string}
 */
function generateEndTime(instanaSpan) {
  const startMs = instanaSpan && instanaSpan.ts !== undefined ? Number(instanaSpan.ts) : 0;
  const deltaMs = instanaSpan && instanaSpan.d !== undefined ? Number(instanaSpan.d) : 0;
  const endMs = startMs + deltaMs;
  return String(endMs * 1000000);
}

/**
 * @param {number} instanaSpanKind
 */
function convertSpanKind(instanaSpanKind) {
  if (instanaSpanKind === 1) return SPAN_KINDS.SERVER;
  if (instanaSpanKind === 2) return SPAN_KINDS.CLIENT;
  if (instanaSpanKind === 3) return SPAN_KINDS.INTERNAL;
  return SPAN_KINDS.UNSPECIFIED;
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
