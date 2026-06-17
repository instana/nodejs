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

  events() {
    return [];
  },

  links() {
    return [];
  }
};

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param { Object} mapper
 * @returns {Record<string, any>}
 */
function extractSpanMetadata(span, mapper) {
  if (!span) return {};

  const OTLP = ctx.semConv;

  const metadataMappings = [
    { otlp: OTLP.metadata.TRACE_ID, transform: metaMapper.convertTraceId },
    { otlp: OTLP.metadata.SPAN_ID, transform: metaMapper.convertSpanId },
    { otlp: OTLP.metadata.PARENT_ID, transform: metaMapper.convertParentId },
    { otlp: OTLP.metadata.SPAN_KIND, transform: metaMapper.convertSpanKind },
    { otlp: OTLP.metadata.START_TIME_UNIX_NANO, transform: metaMapper.convertStartTime },
    { otlp: OTLP.metadata.END_TIME_UNIX_NANO, transform: metaMapper.generateEndTime },
    { otlp: OTLP.metadata.NAME, transform: mapper.spanName },
    { otlp: OTLP.metadata.STATUS, transform: mapper.spanStatus }
  ];

  return metadataMappings.reduce((result, mapping) => {
    const value = mapping.transform(span);

    if (value !== null && value !== undefined) {
      result[mapping.otlp] = value;
    }

    return result;
  }, {});
}

module.exports = {
  extractSpanMetadata
};
