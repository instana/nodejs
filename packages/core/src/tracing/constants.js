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

// new kafka trace correlation (string values) starting approximately 2021-11
exports.kafkaTraceIdHeaderName = 'X_INSTANA_T';
exports.kafkaSpanIdHeaderName = 'X_INSTANA_S';
exports.kafkaTraceLevelHeaderName = 'X_INSTANA_L_S';

exports.kafkaTraceCorrelationDefault = true;
// Before we start phase 1 of the migration, 'binary' will be the default value. With phase 1, we will move to 'both',
// with phase 2 it will no longer be configurable and will always use 'string'.
exports.kafkaHeaderFormatDefault = 'binary';

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
