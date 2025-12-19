/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const {
  MAX_STACK_TRACE_LENGTH,
  validStackTraceModes,
  DEFAULT_STACK_TRACE_MODE,
  DEFAULT_STACK_TRACE_LENGTH
} = require('../../util/constants');

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

//  TODO: Currently the precendence order is:
//  in code config -> env variable -> agent -> default, because this was the existing behavior for stackTraceLength
//  It needs to be revised as breaking change with https://jsw.ibm.com/browse/INSTA-817

/**
 *
 * @param {import('../../config').InstanaConfig} config
 * @returns {{ stackTrace: string, stackTraceLength: number }}
 */
exports.normalize = function normalize(config) {
  if (!config?.tracing) config.tracing = {};

  const stackTrace = normalizeStackTraceMode(config);

  const stackTraceLength = normalizeStackTraceLength(config);

  return {
    stackTrace,
    stackTraceLength
  };
};

/**
 * Normalizes stack trace mode configuration.
 *
 * @param {import('../../config').InstanaConfig} config
 * @returns {string}
 */
function normalizeStackTraceMode(config) {
  if (config?.tracing?.stackTrace) {
    if (typeof config.tracing.stackTrace === 'string') {
      const configValue = config.tracing.stackTrace.toLowerCase();
      if (validStackTraceModes.includes(configValue)) {
        return configValue;
      } else {
        logger?.warn(
          `Invalid value for config.tracing.stackTrace: "${config.tracing.stackTrace}". ` +
            `Valid values are: ${validStackTraceModes.join(', ')}. Using default: all`
        );
      }
    } else {
      logger?.warn(
        `The value of config.tracing.stackTrace has the non-supported type ${typeof config.tracing.stackTrace}. ` +
          `Valid values are: ${validStackTraceModes.join(', ')}. Using default: all`
      );
    }
  }

  if (process.env.INSTANA_STACK_TRACE) {
    const envValue = process.env.INSTANA_STACK_TRACE.toLowerCase();
    if (validStackTraceModes.includes(envValue)) {
      return envValue;
    } else {
      logger?.warn(
        `Invalid value for INSTANA_STACK_TRACE: "${process.env.INSTANA_STACK_TRACE}". ` +
          `Valid values are: ${validStackTraceModes.join(', ')}. Using default: all`
      );
    }
  }

  return DEFAULT_STACK_TRACE_MODE;
}

/**
 * Normalizes stack trace length configuration.
 *
 * @param {import('../../config').InstanaConfig} config
 * @returns {number}
 */
function normalizeStackTraceLength(config) {
  if (config.tracing.stackTraceLength != null) {
    if (typeof config.tracing.stackTraceLength === 'number') {
      return normalizeNumericalStackTraceLength(config.tracing.stackTraceLength);
    } else if (typeof config.tracing.stackTraceLength === 'string') {
      const parsed = parseInt(config.tracing.stackTraceLength, 10);
      if (!isNaN(parsed)) {
        return normalizeNumericalStackTraceLength(parsed);
      } else {
        logger?.warn(
          `The value of config.tracing.stackTraceLength ("${config.tracing.stackTraceLength}") ` +
            'cannot be parsed to a numerical value. Using default value.'
        );
      }
    } else {
      logger?.warn(
        `The value of config.tracing.stackTraceLength has the non-supported type ${typeof config.tracing
          .stackTraceLength}. Using default value.`
      );
    }
  }

  if (process.env.INSTANA_STACK_TRACE_LENGTH) {
    const parsed = parseInt(process.env.INSTANA_STACK_TRACE_LENGTH, 10);
    if (!isNaN(parsed)) {
      return normalizeNumericalStackTraceLength(parsed);
    } else {
      logger?.warn(
        `The value of INSTANA_STACK_TRACE_LENGTH ("${process.env.INSTANA_STACK_TRACE_LENGTH}") ` +
          'cannot be parsed to a numerical value. Falling back to next priority.'
      );
    }
  }

  // Support legacy STACK_TRACE_LENGTH variable (lower priority than INSTANA_STACK_TRACE_LENGTH)
  if (process.env.STACK_TRACE_LENGTH) {
    const parsed = parseInt(process.env.STACK_TRACE_LENGTH, 10);
    if (!isNaN(parsed)) {
      return normalizeNumericalStackTraceLength(parsed);
    } else {
      logger?.warn(
        `The value of STACK_TRACE_LENGTH ("${process.env.STACK_TRACE_LENGTH}") ` +
          'cannot be parsed to a numerical value. Falling back to next priority.'
      );
    }
  }

  return DEFAULT_STACK_TRACE_LENGTH;
}

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

  const result = {
    stackTrace: normalizeAgentStackTrace(config.stackTrace),
    stackTraceLength: normalizeAgentStackTraceLength(config.stackTraceLength)
  };

  return result;
};

/**
 * Normalizes stack trace mode from agent configuration.
 *
 * @param {string} agentStackTrace - Stack trace mode from agent
 * @returns {string | null} - Normalized value or null if should not be applied
 */
function normalizeAgentStackTrace(agentStackTrace) {
  if (agentStackTrace == null) {
    return null;
  }

  const normalizedStackTraceMode =
    typeof agentStackTrace === 'string' ? agentStackTrace.toLowerCase() : agentStackTrace;

  if (validStackTraceModes.includes(normalizedStackTraceMode)) {
    return normalizedStackTraceMode;
  } else {
    logger?.warn(
      `Invalid stack-trace value from agent: ${agentStackTrace}. ` +
        `Valid values are: ${validStackTraceModes.join(', ')}. Ignoring configuration.`
    );
    return null;
  }
}

/**
 *
 * @param {number | string} agentStackTraceLength - Stack trace length from agent
 * @returns {number | null} - Normalized value or null if should not be applied
 */
function normalizeAgentStackTraceLength(agentStackTraceLength) {
  if (agentStackTraceLength == null) {
    return null;
  }

  const parsedLength =
    typeof agentStackTraceLength === 'number' ? agentStackTraceLength : Number(agentStackTraceLength);

  if (Number.isFinite(parsedLength)) {
    const normalized = normalizeNumericalStackTraceLength(parsedLength);
    return normalized;
  } else {
    logger?.warn(
      `Invalid stack-trace-length value from agent: ${agentStackTraceLength}. Expected a number or numeric string.`
    );
    return null;
  }
}

/**
 * Normalizes a numerical stack trace length value.
 * Ensures it's a positive integer within the maximum limit.
 *
 * @param {number} numericalLength
 * @returns {number}
 */
function normalizeNumericalStackTraceLength(numericalLength) {
  const normalized = Math.abs(Math.round(numericalLength));

  let finalValue = normalized;

  if (normalized > MAX_STACK_TRACE_LENGTH) {
    finalValue = MAX_STACK_TRACE_LENGTH;
  }

  return finalValue;
}
