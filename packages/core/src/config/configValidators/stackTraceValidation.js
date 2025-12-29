/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { validStackTraceModes } = require('../../util/constants');

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
