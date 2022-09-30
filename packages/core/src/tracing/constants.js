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

// legacy kafka trace correlation (binary values)
exports.kafkaLegacyTraceContextHeaderName = 'X_INSTANA_C';
exports.kafkaLegacyTraceLevelHeaderName = 'X_INSTANA_L';
exports.kafkaLegacyTraceLevelValueSuppressed = Buffer.from([0]);
exports.kafkaLegacyTraceLevelValueInherit = Buffer.from([1]);

// New kafka trace correlation (string values). Available as opt-in since 2021-10, and send out together with the legacy
// binary headers by default starting in 2022-10. We will switch over to these headers completely (omitting the legacy
// headers approximately in 2023-10.
exports.kafkaTraceIdHeaderName = 'X_INSTANA_T';
exports.kafkaSpanIdHeaderName = 'X_INSTANA_S';
exports.kafkaTraceLevelHeaderName = 'X_INSTANA_L_S';

/**
 * @typedef {'binary' | 'string' | 'both'} KafkaTraceCorrelationFormat
 */

// With the current phase 1 of the Kafka header format migration, 'both', is the default.
// With phase 2 (starting approximately October 2023) it will no longer be configurable and will always use 'string'.
/** @type {KafkaTraceCorrelationFormat} */
exports.kafkaHeaderFormatDefault = 'both';
exports.kafkaTraceCorrelationDefault = true;

exports.allInstanaKafkaHeaders = [
  exports.kafkaTraceIdHeaderName,
  exports.kafkaSpanIdHeaderName,
  exports.kafkaTraceLevelHeaderName,
  exports.kafkaLegacyTraceContextHeaderName,
  exports.kafkaLegacyTraceLevelHeaderName
];

exports.w3cTraceParent = 'traceparent';
exports.w3cTraceState = 'tracestate';
exports.w3cInstana = 'in';
exports.w3cInstanaEquals = `${exports.w3cInstana}=`;

exports.serviceNameHeaderName = 'X-Instana-Service';
exports.serviceNameHeaderNameLowerCase = exports.serviceNameHeaderName.toLowerCase();

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
  LEGACY_TRACE_ID: 'X_INSTANA_ST',
  SPAN_ID: 'X_INSTANA_S',
  LEGACY_SPAN_ID: 'X_INSTANA_SS',
  LEVEL: 'X_INSTANA_L',
  LEGACY_LEVEL: 'X_INSTANA_SL'
};

exports.snsSqsInstanaHeaderPrefixRegex = /"X_INSTANA_/i;

/**
 * Determine if <span> is an entry span (server span).
 * @param {import('./cls').InstanaBaseSpan} span
 * @returns {boolean}
 */
exports.isEntrySpan = function isEntrySpan(span) {
  return span && span.k === exports.ENTRY;
};

/**
 * Determine if <span> is an exit span (client span).
 * @param {import('./cls').InstanaBaseSpan} span
 * @returns {boolean}
 */
exports.isExitSpan = function isExitSpan(span) {
  return span && span.k === exports.EXIT;
};

/**
 * Determine if <span> is an intermediate span (local span).
 * @param {import('./cls').InstanaBaseSpan} span
 * @returns {boolean}
 */
exports.isIntermediateSpan = function isIntermediateSpan(span) {
  return span && span.k === exports.INTERMEDIATE;
};
