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
exports.kafkaTraceContextHeaderNameBinary = 'X_INSTANA_C';
exports.kafkaTraceLevelHeaderNameBinary = 'X_INSTANA_L';
exports.kafkaTraceLevelBinaryValueSuppressed = Buffer.from([0]);
exports.kafkaTraceLevelBinaryValueInherit = Buffer.from([1]);

// new kafka trace correlation (string values) starting approximately 2021-11
exports.kafkaTraceIdHeaderNameString = 'X_INSTANA_T';
exports.kafkaSpanIdHeaderNameString = 'X_INSTANA_S';
exports.kafkaTraceLevelHeaderNameString = 'X_INSTANA_L_S';

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
