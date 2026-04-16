/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Validator that checks if a value exists (not null/undefined)
 * @param {any} value
 * @returns {boolean}
 */
function existsValidator(value) {
  return value != null;
}

/**
 * Validator that checks if a value is a valid number
 * @param {any} value
 * @returns {boolean}
 */
function numberValidator(value) {
  if (value == null) {
    return false;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return !Number.isNaN(num);
}

/**
 * Validator that checks if a value is a boolean or can be parsed as boolean
 * Supports: true/false, "true"/"false", "1"/"0"
 * @param {any} value
 * @returns {boolean}
 */
function booleanValidator(value) {
  if (value == null) {
    return false;
  }

  if (typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'true' || normalized === 'false' || normalized === '1' || normalized === '0';
  }

  return false;
}

/**
 * Validator that checks if a value is a string
 * @param {any} value
 * @returns {boolean}
 */
function stringValidator(value) {
  return typeof value === 'string';
}

/**
 * Validator that checks if a value is a non-empty string
 * @param {any} value
 * @returns {boolean}
 */
function nonEmptyStringValidator(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Validator for inverted boolean env vars (e.g., DISABLE_X means false)
 * This validator inverts the boolean value from env
 * @param {any} value
 * @param {boolean} isEnv - whether this is from env var
 * @returns {boolean}
 */
function invertedBooleanValidator(value, isEnv = false) {
  if (!isEnv) {
    return booleanValidator(value);
  }
  // For env vars, we accept the value if it can be parsed as boolean
  return booleanValidator(value);
}

/**
 * Validator that accepts truthy env var presence
 * @param {any} value
 * @returns {boolean}
 */
function truthyEnvValidator(value) {
  // Accept any truthy value
  return !!value;
}

/**
 * Normalizer: Convert value to number
 * @param {any} value
 * @returns {number|undefined}
 */
function normalizeNumber(value) {
  if (value == null) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Normalizer: Convert value to boolean
 * @param {any} value
 * @returns {boolean|undefined}
 */
function normalizeBoolean(value) {
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
 * Normalizer: Convert value to string
 * @param {any} value
 * @returns {string|undefined}
 */
function normalizeString(value) {
  if (value == null) return undefined;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Normalizer: Invert boolean value (for DISABLE_X env vars)
 * @param {any} value
 * @returns {boolean|undefined}
 */
function normalizeInvertedBoolean(value) {
  const bool = normalizeBoolean(value);
  return bool !== undefined ? !bool : undefined;
}

/**
 * Normalizer: Return true for any truthy value (for env vars that just need to be present)
 * @param {any} value
 * @returns {boolean|undefined}
 */
function normalizeTruthyBoolean(value) {
  // Return true if value is truthy, undefined otherwise
  return value ? true : undefined;
}

module.exports = {
  // Validators (return boolean)
  existsValidator,
  numberValidator,
  booleanValidator,
  stringValidator,
  nonEmptyStringValidator,
  invertedBooleanValidator,
  truthyEnvValidator,

  // Normalizers (convert/transform values)
  normalizeNumber,
  normalizeBoolean,
  normalizeString,
  normalizeInvertedBoolean,
  normalizeTruthyBoolean
};
