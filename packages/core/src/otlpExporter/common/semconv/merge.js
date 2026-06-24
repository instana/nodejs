/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Deeply merges base mappings with version-specific overrides.
 * The merge function recursively combines nested objects, with overrides
 * taking precedence over base values.
 *
 * @param {Record<string, any>} base - The base mapping configuration
 * @param {Record<string, any>} overrides - The version-specific overrides
 * @returns {Record<string, any>} A frozen, merged configuration object
 */
function merge(base, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) {
    return Object.freeze({ ...base });
  }

  /** @type {Record<string, any>} */
  const merged = { ...base };

  Object.keys(overrides).forEach(key => {
    const overrideValue = overrides[key];

    // If the override value is a nested object, merge recursively
    if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
      merged[key] = merge(base[key] || {}, overrideValue);
    } else {
      // Otherwise, directly override the value
      merged[key] = overrideValue;
    }
  });

  return Object.freeze(merged);
}

module.exports = { merge };
