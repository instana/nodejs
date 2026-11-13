/*
 * (c) Copyright IBM Corp. 2026
 */

/* global BigInt */

'use strict';

const {
  validStackTraceModes,
  LOG_LEVEL,
  allowedTransmissionDelayValues,
  SAMPLING_TYPES
} = require('../util/constants');

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * @param {import('../core').GenericLogger} [_logger]
 */
exports.init = _logger => {
  logger = _logger;
};

/**
 * @param {any} value
 * @returns {number|undefined}
 */
exports.numberValidator = function numberValidator(value) {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(num) ? undefined : num;
};

/**
 * @param {any} value
 * @returns {boolean|undefined}
 */
exports.booleanValidator = function booleanValidator(value) {
  if (value == null) return undefined;

  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  return undefined;
};

/**
 * @param {any} value
 * @returns {string|undefined}
 */
exports.stringValidator = function stringValidator(value) {
  if (value == null) return undefined;
  return typeof value === 'string' ? value : undefined;
};

/**
 * @param {any} value
 * @returns {boolean|undefined}
 */
exports.validateTruthyBoolean = function validateTruthyBoolean(value) {
  // Return true if value is truthy, undefined otherwise
  return value ? true : undefined;
};

/**
 * Validates the stack trace mode value.
 *
 * @param {*} value - The value to validate
 * @returns {{ isValid: boolean, error: string | null }} - Validation result
 */
exports.validateStackTraceMode = function validateStackTraceMode(value) {
  if (value === null) {
    return { isValid: false, error: `The value cannot be null. Valid values are: ${validStackTraceModes.join(', ')}.` };
  }

  if (typeof value !== 'string') {
    return {
      isValid: false,
      error: `The value has the non-supported type ${typeof value}. Valid values are: ${validStackTraceModes.join(
        ', '
      )}.`
    };
  }

  const normalizedValue = value.toLowerCase();
  if (validStackTraceModes.includes(normalizedValue)) {
    return { isValid: true, error: null };
  }

  return {
    isValid: false,
    error: `Invalid value: "${value}". Valid values are: ${validStackTraceModes.join(', ')}.`
  };
};

/**
 * Validates the stack trace length value.
 *
 * @param {*} value - The value to validate
 * @returns {{ isValid: boolean, error: string | null }} - Validation result
 */
exports.validateStackTraceLength = function validateStackTraceLength(value) {
  if (value == null) {
    return { isValid: false, error: 'The value cannot be null' };
  }

  let parsedValue;

  if (typeof value === 'number') {
    parsedValue = value;
  } else if (typeof value === 'string') {
    parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      return {
        isValid: false,
        error: `The value ("${value}") cannot be parsed to a numerical value.`
      };
    }
  } else {
    return {
      isValid: false,
      error: `The value has the non-supported type ${typeof value}.`
    };
  }

  if (!Number.isFinite(parsedValue)) {
    return {
      isValid: false,
      error: `Invalid value: ${value}. Expected a number or numeric string.`
    };
  }

  return { isValid: true, error: null };
};

/**
 * @param {any} value
 * @returns {Array<number>|undefined}
 */
exports.httpExitErrorCodeValidator = function httpExitErrorCodeValidator(value) {
  if (typeof value === 'string') {
    value = value.split(',');
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.reduce((result, v) => {
    const code = Number(v);

    if (Number.isInteger(code) && code >= 400 && code <= 499) {
      result.push(code);
    } else {
      logger?.debug(`Ignoring invalid HTTP exit status code "${v}". Expected an integer between 400 and 499.`);
    }

    return result;
  }, []);
};

/**
 * @param {any} value
 * @returns {string|undefined}
 */
exports.logLevelValidator = function logLevelValidator(value) {
  if (value == null) {
    return undefined;
  }
  const VALID_LOG_LEVEL_CAPTURE_VALUES = [LOG_LEVEL.INFO, LOG_LEVEL.WARN, LOG_LEVEL.ERROR, LOG_LEVEL.OFF];

  if (typeof value !== 'string') {
    logger?.debug(
      `Ignoring invalid log level capture value "${value}". Expected one of: ${VALID_LOG_LEVEL_CAPTURE_VALUES.join(
        ', '
      )}.`
    );
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (!VALID_LOG_LEVEL_CAPTURE_VALUES.includes(normalized)) {
    logger?.debug(
      `Ignoring invalid log level capture value "${value}". Expected one of: ${VALID_LOG_LEVEL_CAPTURE_VALUES.join(
        ', '
      )}.`
    );
    return undefined;
  }

  return normalized;
};

/**
 * Validates a metrics transmissionDelay value (ms) against the allowed set.
 * If the value is not in the allowed list, warns and returns the nearest allowed value.
 *
 * @param {number} value - The transmissionDelay value in milliseconds to validate
 * @returns {number} The validated (or snapped) transmissionDelay in ms
 */
exports.validateTransmissionDelay = function validateTransmissionDelay(value) {
  if (allowedTransmissionDelayValues.includes(value)) {
    return value;
  }

  const nearest = allowedTransmissionDelayValues.reduce(
    (prev, curr) => (Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev),
    allowedTransmissionDelayValues[0]
  );
  const allowedMs = allowedTransmissionDelayValues.join(', ');
  const allowedSeconds = allowedTransmissionDelayValues.map(ms => ms / 1000).join(', ');
  logger.warn(
    `The configured poll rate (${value} ms) is not one of the allowed values (${allowedMs} ms).` +
      `Use INSTANA_METRICS_POLL_RATE or config.metrics.pollRate, specify seconds (allowed: ${allowedSeconds} s).` +
      ` If using INSTANA_METRICS_TRANSMISSION_DELAY (deprecated) or config.metrics.transmissionDelay, 
      specify milliseconds (allowed: ${allowedMs} ms). 
    Assuming the nearest allowed value ${nearest} ms.`
  );
  return nearest;
};

/**
 * Accepts a comma-separated string or an array of strings.
 * Returns a trimmed, non-empty string array or undefined if the input is invalid.
 * @param {any} value
 * @returns {string[] | undefined}
 */
exports.captureW3cBaggageValidator = function captureW3cBaggageValidator(value) {
  if (Array.isArray(value)) {
    const keys = value.map(k => (typeof k === 'string' ? k.trim() : '')).filter(k => k !== '');
    return keys.length > 0 ? keys : undefined;
  }

  if (typeof value === 'string') {
    const keys = value
      .split(',')
      .map(k => k.trim())
      .filter(k => k !== '');
    return keys.length > 0 ? keys : undefined;
  }

  return undefined;
};

/**
 * Validator/parser for the allowedColumns field.
 * - String (env var): parsed as a comma-separated list.
 * - Array (in-code): returned as-is after trimming and filtering blank entries.
 * - Anything else: returns undefined (invalid, resolver falls through to next source).
 *
 * @param {any} value
 * @returns {string[]|undefined}
 */
exports.allowedColumnsValidator = function allowedColumnsValidator(value) {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(c => c !== '');
  }
  if (Array.isArray(value)) {
    return value.filter(c => typeof c === 'string' && c.trim() !== '').map(c => c.trim().toLowerCase());
  }
  return undefined;
};

/**
 * @param {any} value
 * @returns {number|undefined}
 */
exports.samplingRateValidator = function samplingRateValidator(value) {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return undefined;
  const intVal = Math.floor(num);
  if (intVal >= 1 && intVal <= 100) {
    return intVal;
  }
  return undefined;
};

/**
 * @param {any} value
 * @returns {number|undefined}
 */
exports.samplingTypeValidator = function samplingTypeValidator(value) {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const upper = trimmed.toUpperCase();
    if (upper === 'NONE') return SAMPLING_TYPES.NONE;
    if (upper === 'RANDOM') return SAMPLING_TYPES.RANDOM;
    const parsedNum = Number(trimmed);
    if (!Number.isNaN(parsedNum) && Number.isFinite(parsedNum) && parsedNum >= 0) {
      const intVal = Math.floor(parsedNum);
      if (Object.values(SAMPLING_TYPES).includes(intVal)) {
        return intVal;
      }
    }
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  const intVal = Math.floor(num);
  if (Object.values(SAMPLING_TYPES).includes(intVal)) {
    return intVal;
  }
  return undefined;
};

/**
 * @param {any} value
 * @returns {number|undefined}
 */
exports.samplingThresholdValidator = function samplingThresholdValidator(value) {
  if (value == null) return undefined;
  if (typeof value === 'bigint') {
    return value >= BigInt(0) ? Number(value) : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    try {
      const b = BigInt(trimmed);
      if (b >= BigInt(0)) return Number(b);
    } catch {
      return undefined;
    }
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.floor(num);
};

/**
 * @param {any} value
 * @returns {number|undefined}
 */
exports.samplingPrecisionValidator = function samplingPrecisionValidator(value) {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 1 || num > 14) return undefined;
  return Math.floor(num);
};
