/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { toTraceId, toSpanId, toTimeUnixNano, toBody, toSeverityText, toSeverityNumber } = require('./util');

const OTLP = /** @type {any} */ (ctx.semConv);

/**
 * @typedef {Object} LogRecordMapping
 * @property {string} otlp
 * @property {string} [instana]
 * @property {any} [value]
 * @property {(value: any) => any} [transform]
 */

/** @type {LogRecordMapping[]} */
const logRecordMappings = [
  { otlp: OTLP.logs.record.TIME_UNIX_NANO, instana: 'ts', transform: toTimeUnixNano },
  { otlp: OTLP.logs.record.OBSERVED_TIME_UNIX_NANO, instana: 'ts', transform: toTimeUnixNano },
  { otlp: OTLP.logs.record.BODY, instana: 'data.log.message', transform: toBody },
  { otlp: OTLP.logs.record.SEVERITY_TEXT, instana: 'data.log.level', transform: toSeverityText },
  { otlp: OTLP.logs.record.SEVERITY_NUMBER, instana: 'data.log.level', transform: toSeverityNumber },
  { otlp: OTLP.common.TRACE_ID, instana: 't', transform: toTraceId },
  { otlp: OTLP.common.SPAN_ID, instana: 'p', transform: toSpanId },
  // TODO: log attributes, example exceptions
  { otlp: OTLP.logs.record.ATTRIBUTES, value: [] }
];

module.exports = {
  logRecordMappings
};
