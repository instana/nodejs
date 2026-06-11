/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { STATUS_CODES, SPAN_KINDS, INSTRUMENTATION_TYPES } = require('../constants');
const { SPAN_NAME_MAPPING } = require('./spanName');

function generateSpanName(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = spanType ? instanaSpan.data?.[spanType] : null;
  if (!data) {
    return instanaSpan.n || spanType || 'unknown';
  }

  const generator = SPAN_NAME_MAPPING[spanType];

  return generator ? generator(data) : instanaSpan.n || spanType;
}

function generateSpanStatus(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = spanType ? instanaSpan.data?.[spanType] : null;

  const hasFailure = instanaSpan.ec > 0;
  return hasFailure
    ? {
        code: STATUS_CODES.ERROR,
        message: data?.error || `${spanType} operation failed`
      }
    : {
        // todo: research
        code: STATUS_CODES.UNSET
      };
}

function getSpanType(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) return null;

  const keys = Object.keys(instanaSpan.data);
  if (keys.length === 0) return null;

  // return first key that is not "peer"
  const nonPeerKey = keys.find(key => key !== INSTRUMENTATION_TYPES.PEER);
  if (nonPeerKey) return nonPeerKey;

  // fallback: if only "peer" exists
  return keys[0];
}

function convertTraceId(instanaTraceId) {
  if (!instanaTraceId) return null;
  return String(instanaTraceId).padStart(32, '0');
}

function convertSpanId(instanaSpanId) {
  if (!instanaSpanId) return null;
  return String(instanaSpanId).padStart(16, '0');
}

function convertTimestamp(msTimestamp) {
  if (msTimestamp == null) return '0';
  // OTLP: timestamp must be an INT64 in nanoseconds
  return String(Math.round(msTimestamp * 1e6));
}

function convertDuration(msDuration) {
  if (msDuration == null) return '0';
  // OTLP: duration must be an INT64 in nanoseconds
  return String(Math.round(msDuration * 1e6));
}

/**
 * @param {number | null | undefined} msDuration
 * @param {{ ts?: number | null | undefined } | null | undefined} instanaSpan
 * @returns {string}
 */
function convertEndTime(msDuration, instanaSpan) {
  if (instanaSpan?.ts == null || msDuration == null) return '0';
  return String(Math.round(instanaSpan.ts * 1e6) + Math.round(msDuration * 1e6));
}

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
  convertDuration,
  convertEndTime,
  convertSpanKind
};
