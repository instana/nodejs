/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * ID and Timestamp Conversion Functions
 * These are separated to avoid circular dependencies with mappers
 */

// ============================================================================
// ID Conversion Functions
// ============================================================================

/**
 * Converts Instana trace ID to OTLP format (32-character hex string)
 */
function convertTraceId(instanaTraceId) {
  if (!instanaTraceId) return null;
  return String(instanaTraceId).padStart(32, '0');
}

/**
 * Converts Instana span ID to OTLP format (16-character hex string)
 */
function convertSpanId(instanaSpanId) {
  if (!instanaSpanId) return null;
  return String(instanaSpanId).padStart(16, '0');
}

// ============================================================================
// Timestamp Conversion Functions
// ============================================================================

/**
 * Converts Instana timestamp to OTLP nanosecond format
 */
function convertTimestamp(timestamp, duration = 0) {
  if (!timestamp) return '0';
  const totalMs = timestamp + duration;
  return String(totalMs * 1000000); // Convert ms to ns
}

/**
 * Converts start timestamp to nanoseconds
 */
function convertStartTime(timestamp) {
  return convertTimestamp(timestamp, 0);
}

/**
 * Converts end timestamp to nanoseconds (start + duration)
 */
function convertEndTime(span) {
  return convertTimestamp(span.ts, span.d);
}

// ============================================================================
// Span Kind Conversion
// ============================================================================

const SpanKind = {
  UNSPECIFIED: 0,
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5
};

/**
 * Determines OTLP span kind from Instana span
 * k=1: Entry/Server, k=2: Exit/Client, k=3: Internal
 */
function convertSpanKind(instanaSpanKind) {
  if (instanaSpanKind === 1) return SpanKind.SERVER;
  if (instanaSpanKind === 2) return SpanKind.CLIENT;
  if (instanaSpanKind === 3) return SpanKind.INTERNAL;
  return SpanKind.UNSPECIFIED;
}

module.exports = {
  convertTraceId,
  convertSpanId,
  convertTimestamp,
  convertStartTime,
  convertEndTime,
  convertSpanKind,
  SpanKind
};

// Made with Bob
