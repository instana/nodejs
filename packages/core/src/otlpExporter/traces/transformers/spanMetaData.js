/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { SPAN_KINDS } = require('../mappers/constants');

const metaMapper = {
  convertTraceId(span) {
    if (span.t === undefined) return undefined;
    if (!span.t) return '';
    return String(span.t).padStart(32, '0');
  },

  convertSpanId(span) {
    if (span.s === undefined) return undefined;
    if (!span.s) return '';
    return String(span.s).padStart(16, '0');
  },

  convertParentId(span) {
    if (span.p === undefined) return undefined;
    if (!span.p) return '';
    return String(span.p).padStart(16, '0');
  },

  convertSpanKind(span) {
    if (span.k === undefined) return undefined;
    if (span.k === 1) return SPAN_KINDS.SERVER;
    if (span.k === 2) return SPAN_KINDS.CLIENT;
    if (span.k === 3) return SPAN_KINDS.INTERNAL;
    return SPAN_KINDS.UNSPECIFIED;
  },

  convertStartTime(span) {
    if (span.ts === undefined) return undefined;
    return String(Number(span.ts) * 1000000);
  },

  generateEndTime(span) {
    const startMs = span.ts !== undefined ? Number(span.ts) : 0;
    const deltaMs = span.d !== undefined ? Number(span.d) : 0;
    return String((startMs + deltaMs) * 1000000);
  },
  // TODO: currently not supported and not added in the payload
  events() {
    return [];
  },

  links() {
    return [];
  }
};

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {Object} mapper
 * @returns {Record<string, any>}
 */
function extractSpanMetadata(span, mapper) {
  if (!span) return {};

  // Resolve the primary instrumentation type once so it can be reused
  const spanType = mapper.getSpanType ? mapper.getSpanType(span) : null;
  const OTLP = ctx.semConv;

  const metadataMappings = [
    { otlp: OTLP.metadata.TRACE_ID, value: metaMapper.convertTraceId(span) },
    { otlp: OTLP.metadata.SPAN_ID, value: metaMapper.convertSpanId(span) },
    { otlp: OTLP.metadata.PARENT_ID, value: metaMapper.convertParentId(span) },
    { otlp: OTLP.metadata.SPAN_KIND, value: metaMapper.convertSpanKind(span) },
    { otlp: OTLP.metadata.START_TIME_UNIX_NANO, value: metaMapper.convertStartTime(span) },
    { otlp: OTLP.metadata.END_TIME_UNIX_NANO, value: metaMapper.generateEndTime(span) },
    { otlp: OTLP.metadata.NAME, value: mapper.spanName(span, spanType) },
    { otlp: OTLP.metadata.STATUS, value: mapper.spanStatus(span, spanType) }
  ];

  return metadataMappings.reduce((acc, current) => {
    if (current.value !== undefined) {
      acc[current.otlp] = current.value;
    }
    return acc;
  }, {});
}

module.exports = {
  extractSpanMetadata
};
