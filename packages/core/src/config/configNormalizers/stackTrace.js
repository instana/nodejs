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

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
  setLogger(config.logger);
};

// Precedence order:
//   agent > in-code > environment variable > default

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
 *
 * @param {*} tracingObj - The tracing object containing stackTrace
 * @param {boolean} [isAgentConfig=false] - Whether this is from agent config
 * @returns {string | null} - Normalized value or null if from agent and invalid
 */
function normalizeStackTraceMode(tracingObj, isAgentConfig = false) {
  const envVar = 'INSTANA_STACK_TRACE';

  if (isAgentConfig) {
    const configPath = 'stack-trace value from agent';

    const validatedAgentConfig = validateStackTraceMode(tracingObj?.stackTrace, configPath);

    if (validatedAgentConfig != null) {
      return validatedAgentConfig;
    }

    return null;
  }

  const validatedConfigGlobal = validateStackTraceMode(
    tracingObj?.global?.stackTrace,
    'config.tracing.global.stackTrace'
  );
  if (validatedConfigGlobal != null) {
    return validatedConfigGlobal;
  }

  const validatedConfig = validateStackTraceMode(tracingObj?.stackTrace, 'config.tracing.stackTrace');
  if (validatedConfig != null) {
    return validatedConfig;
  }

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
 *
 * @param {*} tracingObj - The tracing object containing stackTraceLength
 * @param {boolean} [isAgentConfig=false] - Whether this is from agent config
 * @returns {number | null} - Normalized value or null if from agent and invalid
 */
function normalizeStackTraceLength(tracingObj, isAgentConfig = false) {
  const envVar = 'INSTANA_STACK_TRACE_LENGTH';

  if (isAgentConfig) {
    const configPath = 'stack-trace-length value from agent';

    const validatedAgentConfig = validateStackTraceLength(tracingObj?.stackTraceLength, configPath);
    if (validatedAgentConfig != null) {
      return validatedAgentConfig;
    }

    return null;
  }

  // Note: We currently have 2 in-code config for stackTraceLength:
  //       tracing.global.stackTraceLength(new) takes precedence over tracing.stackTraceLength(legacy)
  const validatedConfigGlobal = validateStackTraceLength(
    tracingObj?.global?.stackTraceLength,
    'config.tracing.global.stackTraceLength'
  );
  if (validatedConfigGlobal != null) {
    return validatedConfigGlobal;
  }

  const validatedConfig = validateStackTraceLength(tracingObj?.stackTraceLength, 'config.tracing.stackTraceLength');
  if (validatedConfig != null) {
    logger.warn(
      'The configuration option config.tracing.stackTraceLength is deprecated and will be removed in a ' +
        'future release. Please use config.tracing.global.stackTraceLength instead.'
    );
    return validatedConfig;
  }

  if (process.env[envVar]) {
    const validatedEnv = validateStackTraceLength(process.env[envVar], envVar);
    if (validatedEnv != null) {
      return validatedEnv;
    }
  }

  return DEFAULT_STACK_TRACE_LENGTH;
}
