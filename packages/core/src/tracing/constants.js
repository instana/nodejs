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

exports.kafkaTraceContextHeaderName = 'X_INSTANA_C';
exports.kafkaTraceLevelHeaderName = 'X_INSTANA_L';

// The JVM tracers sends and expects one single signed byte.
exports.kafkaTraceLevelValueSuppressed = Buffer.from([0]);
exports.kafkaTraceLevelValueInherit = Buffer.from([1]);

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
