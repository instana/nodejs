'use strict';

exports.spanIdHeaderName = 'X-INSTANA-S';
exports.spanIdHeaderNameLowerCase = exports.spanIdHeaderName.toLowerCase();
exports.traceIdHeaderName = 'X-INSTANA-T';
exports.traceIdHeaderNameLowerCase = exports.traceIdHeaderName.toLowerCase();
exports.traceLevelHeaderName = 'X-INSTANA-L';
exports.traceLevelHeaderNameLowerCase = exports.traceLevelHeaderName.toLowerCase();

exports.ENTRY = 1;
exports.EXIT = 2;
exports.INTERMEDIATE = 3;

exports.SDK = {
  ENTRY: 'entry',
  EXIT: 'exit',
  INTERMEDIATE: 'intermediate'
};

/*
 * Determine if <span> is an entry span (server span).
 */
exports.isEntrySpan = function isEntrySpan(span) {
  return span && span.k === exports.ENTRY;
};

/*
 * Determine if <span> is an exit span (client span).
 *
 */
exports.isExitSpan = function isExitSpan(span) {
  return span && span.k === exports.EXIT;
};

/*
 * Determine if <span> is an intermediate span (local span).
 */
exports.isIntermediateSpan = function isIntermediateSpan(span) {
  return span && span.k === exports.INTERMEDIATE;
};
