/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { BASE_OTLP } = require('./lookupBase');
const v123Overrides = require('./v123/overrides').LOOKUP_OVERRIDES;
const latestOverrides = require('./latest/overrides').LOOKUP_OVERRIDES;

/**
 * Deeply compiles and freezes a semantic convention structure by blending a
 * base layout map with version-specific overrides.
 *
 * @param {Object} baseSchema - The foundational fallback mapping configuration
 * @param {Object} overrides - The targeted changes to overlay onto the base map
 * @returns {Object} A fresh, immutable compiled configuration tier
 */
function compileSchema(baseSchema, overrides) {
  if (!overrides) return Object.freeze({ ...baseSchema });

  const compiledSchema = { ...baseSchema };

  Object.keys(overrides).forEach(key => {
    const overrideValue = overrides[key];

    // If the override value is a nested dictionary, traverse down recursively
    if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
      compiledSchema[key] = compileSchema(baseSchema[key] || {}, overrideValue);
    } else {
      compiledSchema[key] = overrideValue;
    }
  });

  return Object.freeze(compiledSchema);
}

const SCHEMA_CACHE = {
  1.23: compileSchema(BASE_OTLP, v123Overrides),
  latest: compileSchema(BASE_OTLP, latestOverrides)
};

/**
 * @param {string} [version] - The target version string ('1.23' or 'latest')
 * @returns {Object} A read-only, deeply nested lookup dictionary
 */
function getLookupConfig(version) {
  const targetVersion = version || '1.23';

  return SCHEMA_CACHE[targetVersion];
}

module.exports = {
  getLookupConfig
};
