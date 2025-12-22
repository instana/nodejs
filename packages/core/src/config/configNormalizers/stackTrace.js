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
//       agent → tracing.global.stackTrace → tracing.stackTraceLength → environment variable → default.

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
 * Priority: agent → tracing.global.stackTrace → tracing.stackTrace → env var → default
 *
 * @param {*} tracingObj - The tracing object containing stackTrace
 * @param {boolean} [isAgentConfig=false] - Whether this is from agent config
 * @returns {string | null} - Normalized value or null if from agent and invalid
 */
function normalizeStackTraceMode(tracingObj, isAgentConfig = false) {
  const envVar = 'INSTANA_STACK_TRACE';

  // For agent config, only validate the agent value
  if (isAgentConfig) {
    const configPath = 'stack-trace value from agent';

    const validatedAgentConfig = validateStackTraceMode(tracingObj?.stackTrace, configPath);

    if (validatedAgentConfig != null) {
      return validatedAgentConfig;
    }

    return null;
  }

  // Check tracing.global.stackTrace first (highest priority for in-code config)
  const validatedConfigGlobal = validateStackTraceMode(
    tracingObj?.global?.stackTrace,
    'config.tracing.global.stackTrace'
  );
  if (validatedConfigGlobal != null) {
    return validatedConfigGlobal;
  }

  // Check tracing.stackTrace (backward compatibility, lower priority)
  const validatedConfig = validateStackTraceMode(tracingObj?.stackTrace, 'config.tracing.stackTrace');
  if (validatedConfig != null) {
    return validatedConfig;
  }

  // Check environment variable
  if (process.env[envVar]) {
    const validatedEnv = validateStackTraceMode(process.env[envVar], envVar);
    if (validatedEnv != null) {
      return validatedEnv;
    }
  }

  return DEFAULT_STACK_TRACE_MODE;
}

/**
 * Normalizes stack trace length configuration.
 * Priority: agent → tracing.global.stackTraceLength → tracing.stackTraceLength → env var → default
 *
 * @param {*} tracingObj - The tracing object containing stackTraceLength
 * @param {boolean} [isAgentConfig=false] - Whether this is from agent config
 * @returns {number | null} - Normalized value or null if from agent and invalid
 */
function normalizeStackTraceLength(tracingObj, isAgentConfig = false) {
  const envVar = 'INSTANA_STACK_TRACE_LENGTH';

  // For agent config, only validate the agent value
  if (isAgentConfig) {
    const configPath = 'stack-trace-length value from agent';

    const validatedAgentConfig = validateStackTraceLength(tracingObj?.stackTraceLength, configPath);
    if (validatedAgentConfig != null) {
      return validatedAgentConfig;
    }

    return null;
  }

  // Check tracing.global.stackTraceLength first (highest priority for in-code config)
  const validatedConfigGlobal = validateStackTraceLength(
    tracingObj?.global?.stackTraceLength,
    'config.tracing.global.stackTraceLength'
  );
  if (validatedConfigGlobal != null) {
    return validatedConfigGlobal;
  }

  // Check tracing.stackTraceLength (backward compatibility, lower priority)
  const validatedConfig = validateStackTraceLength(tracingObj?.stackTraceLength, 'config.tracing.stackTraceLength');
  if (validatedConfig != null) {
    return validatedConfig;
  }

  // Check environment variable
  if (process.env[envVar]) {
    const validatedEnv = validateStackTraceLength(process.env[envVar], envVar);
    if (validatedEnv != null) {
      return validatedEnv;
    }
  }

  return DEFAULT_STACK_TRACE_LENGTH;
}
