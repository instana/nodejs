/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { STATUS_CODES, SPAN_KINDS, INSTRUMENTATION_TYPES } = require('../constants');
const { SPAN_NAME_MAPPING } = require('./spanName');

/**
 * @param {Object} instanaSpan
 * @returns {string} Evaluated name string
 */
function generateSpanName(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = spanType ? instanaSpan.data?.[spanType] : null;
  if (!data) {
    return instanaSpan?.n || spanType || 'unknown';
  }

  const generator = SPAN_NAME_MAPPING[spanType];
  return generator ? generator(data) : instanaSpan.n || spanType;
}

/**
 * @param {Object} instanaSpan
 * @returns {Object}
 */
function generateSpanStatus(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = spanType ? instanaSpan.data?.[spanType] : null;

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
 * @param {Object} instanaSpan
 * @returns {string|null}
 */
function getSpanType(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) return null;

  const keys = Object.keys(instanaSpan.data);
  const len = keys.length;
  if (len === 0) return null;

  for (let i = 0; i < len; i++) {
    const key = keys[i];
    if (key !== INSTRUMENTATION_TYPES.PEER && key !== 'resource') {
      return key;
    }
  }

  return keys[0];
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
