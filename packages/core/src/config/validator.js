/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { validStackTraceModes, LOG_LEVEL } = require('../util/constants');

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
  const VALID_LOG_LEVEL_CAPTURE_VALUES = [LOG_LEVEL.INFO, LOG_LEVEL.WARN, LOG_LEVEL.ERROR, 'off'];

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
