/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { MAX_STACK_TRACE_LENGTH, validStackTraceModes } = require('../../util/constants');

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../core').GenericLogger} loggerInstance
 */
exports.setLogger = function setLogger(loggerInstance) {
  logger = loggerInstance;
};

/**
 * Validates and returns a stack trace mode value.
 *
 * @param {*} value - The value to validate
 * @param {string} source - Source of the value (for logging)
 * @returns {string | null} - Valid mode or null if invalid
 */
exports.validateStackTraceMode = function validateStackTraceMode(value, source) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    logger?.warn(
      `The value of ${source} has the non-supported type ${typeof value}. ` +
        `Valid values are: ${validStackTraceModes.join(', ')}.`
    );
    return null;
  }

  const normalizedValue = value.toLowerCase();
  if (validStackTraceModes.includes(normalizedValue)) {
    return normalizedValue;
  }

  logger?.warn(`Invalid value for ${source}: "${value}". Valid values are: ${validStackTraceModes.join(', ')}.`);
  return null;
};

/**
 * Validates and returns a stack trace length value.
 *
 * @param {*} value - The value to validate
 * @param {string} source - Source of the value (for logging)
 * @returns {number | null} - Valid length or null if invalid
 */
exports.validateStackTraceLength = function validateStackTraceLength(value, source) {
  if (value == null) {
    return null;
  }

  let parsedValue;

  if (typeof value === 'number') {
    parsedValue = value;
  } else if (typeof value === 'string') {
    parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      logger?.warn(`The value of ${source} ("${value}") cannot be parsed to a numerical value.`);
      return null;
    }
  } else {
    logger?.warn(`The value of ${source} has the non-supported type ${typeof value}.`);
    return null;
  }

  if (!Number.isFinite(parsedValue)) {
    logger?.warn(`Invalid ${source} value: ${value}. Expected a number or numeric string.`);
    return null;
  }

  return normalizeNumericalStackTraceLength(parsedValue);
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
