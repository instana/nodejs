/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');

/**
 * @typedef {Object} LogMapper
 * @property {function(import('../../../core').InstanaBaseSpan): string | undefined} traceId
 * @property {function(import('../../../core').InstanaBaseSpan): string | undefined} spanId
 * @property {function(import('../../../core').InstanaBaseSpan): string | undefined} timeUnixNano
 * @property {function(import('../../../core').InstanaBaseSpan): { stringValue: string } | undefined} body
 * @property {function(import('../../../core').InstanaBaseSpan): string | undefined} severityText
 * @property {function(import('../../../core').InstanaBaseSpan): number | undefined} severityNumber
 */

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {LogMapper} mapper
 * @returns {Record<string, any>}
 */
function extractLogRecordMetadata(span, mapper) {
  const OTLP = /** @type {any} */ (ctx.semConv);

  const metadataMappings = [
    { otlp: OTLP.metadata.TIME_UNIX_NANO || 'timeUnixNano', value: mapper.timeUnixNano(span) },
    { otlp: OTLP.metadata.SEVERITY_NUMBER || 'severityNumber', value: mapper.severityNumber(span) },
    { otlp: OTLP.metadata.SEVERITY_TEXT || 'severityText', value: mapper.severityText(span) },
    { otlp: OTLP.metadata.BODY || 'body', value: mapper.body(span) },
    { otlp: OTLP.metadata.TRACE_ID, value: mapper.traceId(span) },
    { otlp: OTLP.metadata.SPAN_ID, value: mapper.spanId(span) }
  ];

  return metadataMappings.reduce((/** @type {Record<string, any>} */ acc, current) => {
    if (current.value !== undefined) {
      acc[current.otlp] = current.value;
    }
    return acc;
  }, {});
}

module.exports = {
  extractLogRecordMetadata
};
