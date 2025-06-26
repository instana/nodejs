/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

exports.traceIdHeaderName = 'X-INSTANA-T';
exports.traceIdHeaderNameLowerCase = exports.traceIdHeaderName.toLowerCase();

exports.spanIdHeaderName = 'X-INSTANA-S';
exports.spanIdHeaderNameLowerCase = exports.spanIdHeaderName.toLowerCase();

exports.traceLevelHeaderName = 'X-INSTANA-L';
exports.traceLevelHeaderNameLowerCase = exports.traceLevelHeaderName.toLowerCase();

exports.syntheticHeaderName = 'X-INSTANA-SYNTHETIC';
exports.syntheticHeaderNameLowerCase = exports.syntheticHeaderName.toLowerCase();

// New Kafka trace correlation (string values) was introduced as an opt-in feature in 2021-10. Initially, it was sent
// out along with the legacy binary headers by default starting in 2022-10. However, as of 2024-10, only string headers
// are supported, and the legacy binary headers are no longer supported.

exports.kafkaTraceIdHeaderName = 'X_INSTANA_T';
exports.kafkaSpanIdHeaderName = 'X_INSTANA_S';
exports.kafkaTraceLevelHeaderName = 'X_INSTANA_L_S';

exports.kafkaTraceCorrelationDefault = true;

exports.allInstanaKafkaHeaders = [
  exports.kafkaTraceIdHeaderName,
  exports.kafkaSpanIdHeaderName,
  exports.kafkaTraceLevelHeaderName
];

exports.w3cTraceParent = 'traceparent';
exports.w3cTraceState = 'tracestate';
exports.w3cInstana = 'in';
exports.w3cInstanaEquals = `${exports.w3cInstana}=`;

exports.ENTRY = 1;
exports.EXIT = 2;
exports.INTERMEDIATE = 3;

exports.SDK = {
  ENTRY: 'entry',
  EXIT: 'exit',
  INTERMEDIATE: 'intermediate'
};

exports.sqsAttributeNames = {
  TRACE_ID: 'X_INSTANA_T',
  SPAN_ID: 'X_INSTANA_S',
  LEVEL: 'X_INSTANA_L'
};

exports.snsSqsInstanaHeaderPrefixRegex = /"X_INSTANA_/i;

/**
 * Determine if <span> is an entry span (server span).
 * @param {import('../core').InstanaBaseSpan} span
 * @returns {boolean}
 */
exports.isEntrySpan = function isEntrySpan(span) {
  return span && span.k === exports.ENTRY;
};

/**
 * Determine if <span> is an exit span (client span).
 * @param {import('../core').InstanaBaseSpan} span
 * @returns {boolean}
 */
exports.isExitSpan = function isExitSpan(span) {
  return span && span.k === exports.EXIT;
};

/**
 * Determine if <span> is an intermediate span (local span).
 * @param {import('../core').InstanaBaseSpan} span
 * @returns {boolean}
 */
exports.isIntermediateSpan = function isIntermediateSpan(span) {
  return span && span.k === exports.INTERMEDIATE;
};

/**
 * Set of all instrumentation groups that can be disabled.
 * @type {Set<string>}
 */
exports.DISABLABLE_INSTRUMENTATION_GROUPS = new Set(['logging', 'messaging', 'databases']);
