/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {Record<string, any>} base - The base mapping configuration
 * @param {Record<string, any>} overrides - The version-specific overrides
 * @returns {Record<string, any>}
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
      merged[key] = overrideValue;
    }
  });

  return Object.freeze(merged);
}

module.exports = { merge };
