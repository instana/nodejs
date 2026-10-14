/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { INSTRUMENTATION_SCOPE_NAME } = require('../../common/constants');

exports.INSTRUMENTATION_SCOPE_NAME = INSTRUMENTATION_SCOPE_NAME;

exports.SEVERITY_NUMBERS = {
  UNSPECIFIED: 0,
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21
};

exports.SEVERITY_TEXTS = {
  TRACE: 'TRACE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  FATAL: 'FATAL'
};

/**
 * OpenTelemetry severity mappings for Instana log levels
 */
exports.INSTANA_SEVERITY_MAP = {
  trace: { number: exports.SEVERITY_NUMBERS.TRACE, text: exports.SEVERITY_TEXTS.TRACE },
  debug: { number: exports.SEVERITY_NUMBERS.DEBUG, text: exports.SEVERITY_TEXTS.DEBUG },
  info: { number: exports.SEVERITY_NUMBERS.INFO, text: exports.SEVERITY_TEXTS.INFO },
  warn: { number: exports.SEVERITY_NUMBERS.WARN, text: exports.SEVERITY_TEXTS.WARN },
  error: { number: exports.SEVERITY_NUMBERS.ERROR, text: exports.SEVERITY_TEXTS.ERROR },
  fatal: { number: exports.SEVERITY_NUMBERS.FATAL, text: exports.SEVERITY_TEXTS.FATAL }
};

exports.SPECIAL_LOG_DATA_TYPES = {
  RESOURCE: 'resource',
  TAGS: 'tags',
  OTEL: 'otel'
};
