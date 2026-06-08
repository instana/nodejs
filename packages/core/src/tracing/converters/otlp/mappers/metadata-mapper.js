/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  convertSpanId,
  convertTraceId,
  convertSpanKind,
  convertTimestamp,
  convertDuration,
  generateSpanName,
  generateSpanStatus
} = require('./metadata-rules');

const { getLookupConfig } = require('../semcov');
const OTLP = getLookupConfig();

const DIRECT_MAPPINGS = {
  t: { otlp: OTLP.metadata.TRACE_ID, transform: convertTraceId },
  s: { otlp: OTLP.metadata.SPAN_ID, transform: convertSpanId },
  p: { otlp: OTLP.metadata.PARENT_ID, transform: convertSpanId },
  k: { otlp: OTLP.metadata.SPAN_KIND, transform: convertSpanKind },
  ts: { otlp: OTLP.metadata.TIMESTAMP, transform: convertTimestamp },
  d: { otlp: OTLP.metadata.DURATION, transform: convertDuration }
};

const COMPUTED_MAPPINGS = [
  { otlp: OTLP.metadata.NAME, compute: generateSpanName },
  { otlp: OTLP.metadata.STATUS, compute: generateSpanStatus }
];

module.exports = {
  DIRECT_MAPPINGS,
  COMPUTED_MAPPINGS
};
