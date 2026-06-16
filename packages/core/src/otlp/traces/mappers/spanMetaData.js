/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  convertSpanId,
  convertTraceId,
  convertSpanKind,
  convertTimestampToUnixNano,
  computeEndTimeUnixNano,
  generateSpanName,
  generateSpanStatus
} = require('./helper');

/**
 * @param {Object} OTLP
 * @param {Object} [instrumentationMappings] - Pre-computed instrumentation mappings (optional)
 */
function getMetadataMappings(OTLP, instrumentationMappings) {
  const directMappings = {
    t: { otlp: OTLP.metadata.TRACE_ID, transform: convertTraceId },
    s: { otlp: OTLP.metadata.SPAN_ID, transform: convertSpanId },
    p: { otlp: OTLP.metadata.PARENT_ID, transform: convertSpanId },
    k: { otlp: OTLP.metadata.SPAN_KIND, transform: convertSpanKind },
    ts: { otlp: OTLP.metadata.START_TIME_UNIX_NANO, transform: convertTimestampToUnixNano }
  };

  const computedMappings = [
    { otlp: OTLP.metadata.NAME, compute: span => generateSpanName(span, instrumentationMappings) },
    { otlp: OTLP.metadata.STATUS, compute: generateSpanStatus },
    { otlp: OTLP.metadata.END_TIME_UNIX_NANO, compute: computeEndTimeUnixNano }
  ];

  return { directMappings, computedMappings };
}

module.exports = {
  getMetadataMappings
};
