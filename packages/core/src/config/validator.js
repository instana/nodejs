/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {any} value
 * @returns {number|undefined}
 */
function numberValidator(value) {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * @param {any} value
 * @returns {boolean|undefined}
 */
function booleanValidator(value) {
  if (value == null) return undefined;

  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  return undefined;
}

/**
 * @param {any} value
 * @returns {string|undefined}
 */
function stringValidator(value) {
  if (value == null) return undefined;
  return typeof value === 'string' ? value : undefined;
}

/**
 * @param {any} value
 * @returns {boolean|undefined}
 */
function validateTruthyBoolean(value) {
  // Return true if value is truthy, undefined otherwise
  return value ? true : undefined;
}

module.exports = {
  numberValidator,
  booleanValidator,
  stringValidator,
  validateTruthyBoolean
};
