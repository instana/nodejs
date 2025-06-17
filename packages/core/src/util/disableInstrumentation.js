/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let agentConfig;

// Disabling with category restricted to the following categories.
const DISABLED_CATEGORIES = new Set(['logging', 'databases', 'protocols', 'messaging']);

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} _config
 */
function init(_config) {
  config = _config;
}

/**
 * @param {import('../util/normalizeConfig').AgentConfig} _agentConfig
 */
function activate(_agentConfig) {
  agentConfig = _agentConfig;
}

/**
 * Extracts the module name from the given instrumentation key.
 * @param {string} instrumentationKey
 * @returns {string}
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
 * Extracts the category and module names from an instrumentation key.
 * @param {string} instrumentationKey
 */
function extractCategoryAndModule(instrumentationKey) {
  const match = instrumentationKey.match(/\.\/instrumentation\/([^/]+)\/([^/]+)/);
  return match ? [match[1], match[2]] : null;
}

/**
 * @param {*} cfg
 * @param {string} category
 * @param {string} module
 */
function isInstrumentationDisabledInConfig(cfg, category, module) {
  if (!DISABLED_CATEGORIES.has(category)) {
    return false;
  }

  const disabledItems = cfg?.tracing?.disable;
  if (!disabledItems) {
    return false;
  }

  if (disabledItems.length) {
    return disabledItems.includes(category) || disabledItems.includes(module);
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

  // Case 1: Explicitly listed in disabled tracers (library or instrumentation name)
  const disable = config?.tracing?.disable || [];
  if (disable.includes(moduleName) || (instrumentationName && disable.includes(instrumentationName))) {
    return true;
  }

  // Case 2: Disabled via category/module flags in config or agentConfig
  const categoryAndModule = extractCategoryAndModule(instrumentationKey);
  if (categoryAndModule) {
    const [category, module] = categoryAndModule;

    if (
      isInstrumentationDisabledInConfig(config, category, module) ||
      isInstrumentationDisabledInConfig(agentConfig, category, module)
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
