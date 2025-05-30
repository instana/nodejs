/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * @param {string} instrumentationKey
 */
function extractModuleName(instrumentationKey) {
  // Extracts the module name from the instrumentation key.
  // Tries to match the pattern './instrumentation/<category>/<module>' and extract the <module> part.
  // If that pattern doesn't match (e.g., in custom instrumentation cases),
  // it falls back to extracting the last segment of the path after the final '/'.
  const matchResult = instrumentationKey.match(/.\/instrumentation\/[^/]*\/(.*)/);
  return matchResult ? matchResult[1] : instrumentationKey.match(/\/([^/]+)$/)[1].toLowerCase();
}

/**
 * @param {string} instrumentationKey
 */
function extractCategoryPath(instrumentationKey) {
  // Parses the instrumentation key to extract both the category and module names.
  // It matches the pattern './instrumentation/<category>/<module>' and returns them.
  const match = instrumentationKey.match(/\.\/instrumentation\/([^/]+)\/([^/]+)/);
  return match ? [match[1], match[2]] : null;
}

/**
 * @param {Object.<string, import('../tracing/index').InstanaInstrumentedModule>} instrumentationModules
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 * @param {string} instrumentationKey
 * @returns {boolean}
 */
function isInstrumentationDisabled(instrumentationModules, config, instrumentationKey) {
  const moduleName = extractModuleName(instrumentationKey);

  // Case 1: Disabled via disabledTracers config
  if (
    config.tracing.disabledTracers.includes(moduleName) ||
    (instrumentationModules[instrumentationKey]?.instrumentationName &&
      config.tracing.disabledTracers.includes(instrumentationModules[instrumentationKey].instrumentationName))
  ) {
    return true;
  }

  // Case 2: Disabled through category-level or module-specific settings.
  // Example: `logger.enabled = false` disables all instrumentation under the "logger" category.
  const categoryPath = extractCategoryPath(instrumentationKey);
  if (categoryPath) {
    const [category, module] = categoryPath;

    // @ts-ignore
    if (config.tracing[category]?.enabled === false) {
      return true;
    }

    // @ts-ignore
    if (config.tracing[category]?.[module]?.enabled === false || config.tracing[moduleName]?.enabled === false) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isInstrumentationDisabled
};
