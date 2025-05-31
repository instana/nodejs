/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let extraConfig;

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
 * @param {string} category
 * @param {string} module
 */
function isExplicitlyEnabled(category, module) {
  return (
    // @ts-ignore
    config?.tracing?.[category]?.[module]?.enabled === true ||
    // @ts-ignore
    extraConfig?.tracing?.[category]?.[module]?.enabled === true
  );
}

/**
 * @param {*} cfg
 * @param {string} category
 * @param {string} module
 * @param {string} moduleName
 * @returns {boolean}
 */
function isDisabledInConfig(cfg, category, module, moduleName) {
  const tracing = cfg?.tracing;
  return (
    tracing?.[category]?.enabled === false ||
    tracing?.[category]?.[module]?.enabled === false ||
    tracing?.[moduleName]?.enabled === false
  );
}

/**
 * @param {Object} options
 * @param {Object.<string, import('../tracing/index').InstanaInstrumentedModule>} [options.instrumentationModules]
 * @param {string} options.instrumentationKey
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
  // Example: `logger.enabled = false` disables all instrumentation under the "logger" category.
  const categoryPath = extractCategoryPath(instrumentationKey);
  if (categoryPath) {
    const [category, module] = categoryPath;

    // Check if explicitly enabled in either config (enable overrides disable)
    if (isExplicitlyEnabled(category, module)) return false;

    // Check if disabled in either config
    // First prio in in-code or env variable and last prio agent
    if (
      isDisabledInConfig(config, category, module, moduleName) ||
      isDisabledInConfig(extraConfig, category, module, moduleName)
    ) {
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
