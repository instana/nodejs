/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { MAX_STACK_TRACE_LENGTH, validStackTraceModes } = require('../../util/constants');

/**
 * Normalizes stackTrace mode from config
 * @param {import('../../config').InstanaConfig} config
 * @returns {string} - Normalized value
 */
exports.normalizeStackTraceMode = function (config) {
  const value = config?.tracing?.global?.stackTrace;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (validStackTraceModes.includes(normalized)) {
      return normalized;
    }
  }

  return null;
};

/**
 * Normalizes stack trace length configuration based on precedence.
 * Precedence: global config > config > env var > default
 * @param {import('../../config').InstanaConfig} config
 * @returns {number} - Normalized value
 */
exports.normalizeStackTraceLength = function (config) {
  const tracingObj = config?.tracing;

  // Note: For in-code configuration, global takes precedence,
  // because we are migrating away from legacy config tracing.stackTraceLength
  // tracing.global.stackTraceLength > tracing.stackTraceLength
  if (tracingObj?.global?.stackTraceLength != null) {
    const parsed =
      typeof tracingObj.global.stackTraceLength === 'number'
        ? tracingObj.global.stackTraceLength
        : parseInt(tracingObj.global.stackTraceLength, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      return normalizeNumericalStackTraceLength(parsed);
    }
  }

  if (tracingObj?.stackTraceLength != null) {
    const parsed =
      typeof tracingObj.stackTraceLength === 'number'
        ? tracingObj.stackTraceLength
        : parseInt(tracingObj.stackTraceLength, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      return normalizeNumericalStackTraceLength(parsed);
    }
  }

  return null;
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
 * Normalizes stackTrace mode from environment variable value
 * @param {string} envValue - The environment variable value to normalize
 * @returns {string | null}
 */
exports.normalizeStackTraceModeEnv = function (envValue) {
  if (envValue) {
    const normalized = String(envValue).toLowerCase();
    if (validStackTraceModes.includes(normalized)) {
      return normalized;
    }
  }

  return null;
};

/**
 * Normalizes stackTraceLength from environment variable value
 * @param {string} envValue - The environment variable value to normalize
 * @returns {number | null}
 */
exports.normalizeStackTraceLengthEnv = function (envValue) {
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && Number.isFinite(parsed)) {
      return normalizeNumericalStackTraceLength(parsed);
    }
  }

  return null;
};
