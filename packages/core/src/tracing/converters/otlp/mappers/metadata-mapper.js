/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { OTLP } = require('./lookup');

const {
  convertSpanId,
  convertTraceId,
  convertSpanKind,
  convertEndTime,
  convertStartTime
} = require('../id-converters');

const METADATA_MAPPINGS = {
  t: { otlp: OTLP.metadata.TRACE_ID, transform: convertTraceId },
  s: { otlp: OTLP.metadata.SPAN_ID, transform: convertSpanId },
  p: { otlp: OTLP.metadata.PARENT_ID, transform: convertSpanId },
  k: { otlp: OTLP.metadata.SPAN_KIND, transform: convertSpanKind },
  ts: { otlp: OTLP.metadata.START_TIME, transform: convertStartTime },
  d: { otlp: OTLP.metadata.END_TIME, transform: convertEndTime },
  // Getter-based fields (require full span context, resolved at runtime via string)
  // TODO: this string getter is hard to maintain, need to update to proper fn like transform
  name: { otlp: OTLP.metadata.NAME, getter: 'generateSpanName' },
  status: { otlp: OTLP.metadata.STATUS, getter: 'generateSpanStatus' }
};

module.exports = {
  METADATA_MAPPINGS
};
