/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { OTLP_SPAN_KINDS, INSTANA_SPAN_KINDS } = require('../mappers/constants');

const metaMapper = {
  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   * @returns {string | undefined}
   */
  convertTraceId(span) {
    if (span.t === undefined) return undefined;
    if (!span.t) return '';
    return String(span.t).padStart(32, '0');
  },

  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   * @returns {string | undefined}
   */
  convertSpanId(span) {
    if (span.s === undefined) return undefined;
    if (!span.s) return '';
    return String(span.s).padStart(16, '0');
  },

  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   * @returns {string | undefined}
   */
  convertParentId(span) {
    if (span.p === undefined) return undefined;
    if (!span.p) return '';
    return String(span.p).padStart(16, '0');
  },

  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   * @returns {number | undefined}
   */
  convertSpanKind(span) {
    if (span.k === INSTANA_SPAN_KINDS.ENTRY) {
      return OTLP_SPAN_KINDS.SERVER;
    }
    if (span.k === INSTANA_SPAN_KINDS.EXIT) {
      return OTLP_SPAN_KINDS.CLIENT;
    }

    if (span.k === INSTANA_SPAN_KINDS.INTERMEDIATE) {
      return OTLP_SPAN_KINDS.INTERNAL;
    }

    return OTLP_SPAN_KINDS.UNSPECIFIED;
  },

  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   * @returns {string | undefined}
   */
  convertStartTime(span) {
    if (span.ts === undefined) return undefined;
    return String(Number(span.ts) * 1000000);
  },

  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   * @returns {string}
   */
  generateEndTime(span) {
    const startMs = span.ts !== undefined ? Number(span.ts) : 0;
    const deltaMs = span.d !== undefined ? Number(span.d) : 0;
    return String((startMs + deltaMs) * 1000000);
  },

  /**
   * TODO: currently not supported in Instana and not added in the payload
   * @returns {any[]}
   */
  events() {
    return [];
  },

  /**
   * TODO: currently not supported in Instana and not added in the payload
   * @returns {any[]}
   */
  links() {
    return [];
  }
};

/**
 * @typedef {Object} SpanMapper
 * @property {function(import('../../../core').InstanaBaseSpan): string} spanName
 * @property {function(import('../../../core').InstanaBaseSpan): { code: number, message?: string }} spanStatus
 */

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {SpanMapper} mapper
 * @returns {Record<string, any>}
 */
function extractSpanMetadata(span, mapper) {
  const OTLP = /** @type {any} */ (ctx.semConv);

  const metadataMappings = [
    { otlp: OTLP.metadata.TRACE_ID, value: metaMapper.convertTraceId(span) },
    { otlp: OTLP.metadata.SPAN_ID, value: metaMapper.convertSpanId(span) },
    { otlp: OTLP.metadata.PARENT_ID, value: metaMapper.convertParentId(span) },
    { otlp: OTLP.metadata.SPAN_KIND, value: metaMapper.convertSpanKind(span) },
    { otlp: OTLP.metadata.START_TIME_UNIX_NANO, value: metaMapper.convertStartTime(span) },
    { otlp: OTLP.metadata.END_TIME_UNIX_NANO, value: metaMapper.generateEndTime(span) },
    { otlp: OTLP.metadata.NAME, value: mapper.spanName(span) },
    { otlp: OTLP.metadata.STATUS, value: mapper.spanStatus(span) }
  ];

  return metadataMappings.reduce((/** @type {Record<string, any>} */ acc, current) => {
    if (current.value !== undefined) {
      acc[current.otlp] = current.value;
    }
    return acc;
  }, {});
}

module.exports = {
  extractSpanMetadata
};
