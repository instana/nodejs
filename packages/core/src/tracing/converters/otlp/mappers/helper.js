/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { STATUS_CODES, SPAN_KINDS } = require('../constants');
const instrRegistry = require('../../../instrumentationRegistry');

// this is mapper helper
// help map value
// TBD
const formatters = {
  http(data) {
    const method = (data.method || data.operation || 'HTTP').toUpperCase();
    const path = data.path || data.url || '/';
    return `${method} ${path}`;
  },
  messaging(data) {
    const operation = data.operation || data.access || data.sort || 'messaging';
    const destination = data.service || data.topic || data.queue || data.subject || 'unknown';
    return `${operation} ${destination}`;
  },
  databases(data, spanType) {
    const operation = data.command || data.operation || data.action || 'query';
    const systemName = spanType;
    return `${systemName}.${operation}`;
  }
  // cloud, etc
};

function generateSpanName(instanaSpan) {
  if (!instanaSpan) return 'unknown';

  const spanType = getSpanType(instanaSpan);
  const data = spanType ? instanaSpan.data?.[spanType] : null;

  if (!data) return instanaSpan.n || 'unknown';

  const group = instrRegistry.getGroupForSpanType(spanType);
  const fallback = instanaSpan.n || 'unknown';

  if (spanType === 'http') return formatters.http(data);
  if (group === 'messaging') return formatters.messaging(data);
  if (group === 'databases') return formatters.databases(data, spanType);

  return fallback;
}

function computeHttpStatus(span, data) {
  if (span.ec && span.ec > 0) return { code: STATUS_CODES.ERROR, message: data.error || 'Error occurred' };
  const httpStatus = data.status;
  if (httpStatus >= 400) return { code: STATUS_CODES.ERROR, message: `HTTP ${httpStatus}` };
  return { code: STATUS_CODES.OK };
}

function generateSpanStatus(instanaSpan) {
  if (!instanaSpan) return { code: STATUS_CODES.UNSET };

  const spanType = getSpanType(instanaSpan);
  const data = spanType ? instanaSpan.data?.[spanType] : null;

  if (spanType === 'http') {
    return computeHttpStatus(instanaSpan, data || {});
  }

  const hasFailure = instanaSpan.ec > 0;
  const group = instrRegistry.getGroupForSpanType(spanType);

  const isGrouped = group === 'messaging' || group === 'databases';

  if (!isGrouped) {
    // handle this case
    return hasFailure ? { code: STATUS_CODES.ERROR, message: 'Error occurred' } : { code: STATUS_CODES.OK };
  }

  return hasFailure ? { code: STATUS_CODES.ERROR, message: `${spanType} operation failed` } : { code: STATUS_CODES.OK };
}

function getSpanType(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) return null;

  const keys = Object.keys(instanaSpan.data);
  if (keys.length === 0) return null;

  // return first key that is not "peer"
  const nonPeerKey = keys.find(key => key !== 'peer');
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
  convertSpanKind
};
