/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { OTLP } = require('./lookup');

const {
  convertSpanId,
  convertTraceId,
  convertSpanKind,
  convertTimestamp,
  convertDuration
} = require('../utils/id-converters');

const METADATA_MAPPINGS = {
  t: { otlp: OTLP.metadata.TRACE_ID, transform: convertTraceId },
  s: { otlp: OTLP.metadata.SPAN_ID, transform: convertSpanId },
  p: { otlp: OTLP.metadata.PARENT_ID, transform: convertSpanId },
  k: { otlp: OTLP.metadata.SPAN_KIND, transform: convertSpanKind },
  ts: { otlp: OTLP.metadata.TIMESTAMP, transform: convertTimestamp },
  d: { otlp: OTLP.metadata.DURATION, transform: convertDuration },
  // Getter-based fields (require full span context, resolved at runtime via string)
  // TODO: this string getter is hard to maintain, need to update to proper fn like transform
  name: { otlp: OTLP.metadata.NAME, getter: 'generateSpanName' },
  status: { otlp: OTLP.metadata.STATUS, getter: 'generateSpanStatus' }
};

module.exports = {
  METADATA_MAPPINGS
};
