/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const {
  DEFAULT_STACK_TRACE_MODE,
  DEFAULT_STACK_TRACE_LENGTH,
  MAX_STACK_TRACE_LENGTH,
  validStackTraceModes
} = require('../../util/constants');

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * Normalizes stackTrace mode from config
 * @param {import('../../config').InstanaConfig} config
 * @returns {string}
 */
exports.normalizeStackTraceMode = function (config) {
  return normalizeStackTraceMode(config?.tracing);
};

/**
 * Normalizes stackTraceLength from config
 * @param {import('../../config').InstanaConfig} config
 * @returns {number}
 */
exports.normalizeStackTraceLength = function (config) {
  return normalizeStackTraceLength(config?.tracing);
};

/**
 * Normalizes stackTrace mode from agent config
 * @param {*} stackTraceValue - tracing.global[stack-trace] config from agent
 * @returns {string | null}
 */
exports.normalizeStackTraceModeFromAgent = function (stackTraceValue) {
  return stackTraceValue?.toLowerCase();
};

/**
 * Normalizes stackTraceLength from agent config
 * @param {*} stackTraceLength - tracing.global[stack-trace-length] from agent
 * @returns {number | null}
 */
exports.normalizeStackTraceLengthFromAgent = function (stackTraceLength) {
  const parsed = typeof stackTraceLength === 'number' ? stackTraceLength : parseInt(stackTraceLength, 10);
  if (!isNaN(parsed) && Number.isFinite(parsed)) {
    return normalizeNumericalStackTraceLength(parsed);
  }

  return null;
};

/**
 * Normalizes a numerical stack trace length value.
 * Ensures it's a positive integer within the maximum limit.
 *
 * @param {number} numericalLength
 * @returns {number}
 */
function normalizeNumericalStackTraceLength(numericalLength) {
  const normalized = Math.abs(Math.round(numericalLength));
  return Math.min(normalized, MAX_STACK_TRACE_LENGTH);
}

/**
 * Normalizes stack trace mode configuration based on precedence.
 * Precedence: global config > env var > default
 *
 * @param {*} tracingObj - The tracing object containing stackTrace
 * @returns {string} - Normalized value
 */
function normalizeStackTraceMode(tracingObj) {
  const value = tracingObj?.global?.stackTrace;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (validStackTraceModes.includes(normalized)) {
      return normalized;
    }
  }

  const envVar = 'INSTANA_STACK_TRACE';
  if (process.env[envVar]) {
    const normalized = process.env[envVar].toLowerCase();
    if (validStackTraceModes.includes(normalized)) {
      return normalized;
    }
  }

  return DEFAULT_STACK_TRACE_MODE;
}

/**
 * Normalizes stack trace length configuration based on precedence.
 * Precedence: global config > config > env var > default
 *
 * @param {*} tracingObj - The tracing object containing stackTraceLength
 * @returns {number} - Normalized value
 */
function normalizeStackTraceLength(tracingObj) {
  // Note: For in-code configuration, global takes precedence.
  // tracing.global.stackTraceLength > tracing.stackTraceLength
  if (tracingObj?.global?.stackTraceLength != null) {
    const parsed =
      typeof tracingObj.global.stackTraceLength === 'number'
        ? tracingObj.global.stackTraceLength
        : parseInt(tracingObj.global.stackTraceLength, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      const normalized = Math.abs(Math.round(parsed));
      return Math.min(normalized, MAX_STACK_TRACE_LENGTH);
    }
  }

  if (tracingObj?.stackTraceLength != null) {
    const parsed =
      typeof tracingObj.stackTraceLength === 'number'
        ? tracingObj.stackTraceLength
        : parseInt(tracingObj.stackTraceLength, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      const normalized = Math.abs(Math.round(parsed));
      return Math.min(normalized, MAX_STACK_TRACE_LENGTH);
    }
  }

  const envVar = 'INSTANA_STACK_TRACE_LENGTH';
  if (process.env[envVar]) {
    const parsed = parseInt(process.env[envVar], 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      const normalized = Math.abs(Math.round(parsed));
      return Math.min(normalized, MAX_STACK_TRACE_LENGTH);
    }
  }

  return DEFAULT_STACK_TRACE_LENGTH;
}
