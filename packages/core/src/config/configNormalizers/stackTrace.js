/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const {
  setLogger,
  validateStackTraceMode,
  validateStackTraceLength
} = require('../configValidators/stackTraceValidation');

const { DEFAULT_STACK_TRACE_MODE, DEFAULT_STACK_TRACE_LENGTH } = require('../../util/constants');

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  setLogger(config.logger);
};

// The precedence order is:
//       agent → programmatic config → environment variable → default.

/**
 *
 * @param {import('../../config').InstanaConfig} config
 * @returns {{ stackTrace: string, stackTraceLength: number }}
 */
exports.normalize = function normalize(config) {
  if (!config) {
    config = {};
  }

  if (!config.tracing) {
    config.tracing = {};
  }

  const stackTrace = normalizeStackTraceMode(config.tracing);
  const stackTraceLength = normalizeStackTraceLength(config.tracing);

  return {
    stackTrace,
    stackTraceLength
  };
};

/**
 * Normalizes stack trace configuration from agent.
 *
 * @param {*} config - tracing.global config from agent containing stack-trace and stack-trace-length
 * @returns {{ stackTrace: string | null, stackTraceLength: number | null }} - Normalized values
 */
exports.normalizeAgentConfig = function normalizeAgentConfig(config) {
  if (!config || typeof config !== 'object') {
    return { stackTrace: null, stackTraceLength: null };
  }

  const tracingObj = {
    stackTrace: config['stack-trace'],
    stackTraceLength: config['stack-trace-length']
  };

  const result = {
    stackTrace: normalizeStackTraceMode(tracingObj, true),
    stackTraceLength: normalizeStackTraceLength(tracingObj, true)
  };

  return result;
};

/**
 * Normalizes stack trace mode configuration.
 * Priority: agent → programmatic config → env var → default
 *
 * @param {*} tracingObj - The tracing object containing stackTrace
 * @param {boolean} [isAgentConfig=false] - Whether this is from agent config
 * @returns {string | null} - Normalized value or null if from agent and invalid
 */
function normalizeStackTraceMode(tracingObj, isAgentConfig = false) {
  const configPath = isAgentConfig ? 'stack-trace value from agent' : 'config.tracing.stackTrace';
  const envVar = 'INSTANA_STACK_TRACE';

  if (tracingObj.stackTrace != null) {
    const validated = validateStackTraceMode(tracingObj.stackTrace, configPath);
    if (validated != null) {
      return validated;
    }
  }

  // For agent config normalisation, we don't check environment variables or use defaults
  if (isAgentConfig) {
    return null;
  }

  if (process.env[envVar]) {
    const validated = validateStackTraceMode(process.env[envVar], envVar);
    if (validated != null) {
      return validated;
    }
  }

  return DEFAULT_STACK_TRACE_MODE;
}

/**
 * Normalizes stack trace length configuration.
 * Priority: agent → programmatic config → env var → default
 *
 * @param {*} tracingObj - The tracing object containing stackTraceLength
 * @param {boolean} [isAgentConfig=false] - Whether this is from agent config
 * @returns {number | null} - Normalized value or null if from agent and invalid
 */
function normalizeStackTraceLength(tracingObj, isAgentConfig = false) {
  const configPath = isAgentConfig ? 'stack-trace-length value from agent' : 'config.tracing.stackTraceLength';
  const envVar = 'INSTANA_STACK_TRACE_LENGTH';

  if (tracingObj.stackTraceLength != null) {
    const validated = validateStackTraceLength(tracingObj.stackTraceLength, configPath);
    if (validated != null) {
      return validated;
    }
  }

  // For agent config normalisation, we don't check environment variables or use defaults
  if (isAgentConfig) {
    return null;
  }

  if (process.env[envVar]) {
    const validated = validateStackTraceLength(process.env[envVar], envVar);
    if (validated != null) {
      return validated;
    }
  }

  return DEFAULT_STACK_TRACE_LENGTH;
}
