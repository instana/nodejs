/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let extraConfig;

// Disabling with category restricted to the following categories.
const allowedDisablingCategories = new Set(['logging']);

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} _config
 */
function init(_config) {
  config = _config;
}

/**
 * @param {import('../util/normalizeConfig').AgentConfig} _extraConfig
 */
function activate(_extraConfig) {
  extraConfig = _extraConfig;
}

/**
 * @param {string} instrumentationKey
 */
function extractModuleName(instrumentationKey) {
  // Extracts the module name from the instrumentation key.
  // Tries to match the pattern './instrumentation/<category>/<module>' and extract the <module> part.
  // If that pattern doesn't match (e.g., in custom instrumentation cases),
  // it falls back to extracting the last segment of the path after the final '/'.
  const matchResult = instrumentationKey.match(/.\/instrumentation\/[^/]*\/(.*)/);
  const moduleName = matchResult ? matchResult[1] : instrumentationKey.match(/\/([^/]+)$/)[1];
  return moduleName.toLowerCase();
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
 * @param {*} cfg
 * @param {string} category
 * @param {string} module
 */
function isDisabledInConfig(cfg, category, module) {
  const tracing = cfg?.tracing;

  // For allowed categories only, check category-level and module-specific disabling
  if (allowedDisablingCategories.has(category)) {
    if (tracing?.[category]?.disable === true) {
      return true;
    }

    if (tracing?.[category]?.[module]?.disable === true) {
      return true;
    }
    // check direct module disabling
    // future extenstion
    // if (tracing?.[moduleName]?.disable === true) {
    //   return true;
    // }
  }

  return false;
}

/**
 * @param {Object} params
 * @param {Object.<string, import('../tracing/index').InstanaInstrumentedModule>} [params.instrumentationModules]
 * @param {string} params.instrumentationKey
 * @returns {boolean}
 */
function isInstrumentationDisabled({ instrumentationModules = {}, instrumentationKey }) {
  const moduleName = extractModuleName(instrumentationKey);
  const instrumentationName = instrumentationModules[instrumentationKey]?.instrumentationName;

  // Case 1: Explicitly disabled in config.tracing.disabledTracers
  if (
    config?.tracing?.disabledTracers?.includes(moduleName.toLowerCase()) ||
    (instrumentationName && config?.tracing?.disabledTracers?.includes(instrumentationName))
  ) {
    return true;
  }

  // Case 2: Disabled through category-level or module-specific settings.
  // Example: `logger.disable = true` disables all instrumentation under the "logger" category.
  const categoryPath = extractCategoryPath(instrumentationKey);
  if (categoryPath) {
    const [category, module] = categoryPath;

    // Check if disable in either config
    // First prio in in-code or env variable and last prio agent
    if (isDisabledInConfig(config, category, module) || isDisabledInConfig(extraConfig, category, module)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  init,
  activate,
  isInstrumentationDisabled
};
