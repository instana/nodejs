/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let agentConfig;

// Disabling with category restricted to the following categories.
const supportedCategoriesForDisabling = new Set(['logging']);

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
  const tracingCfg = cfg?.tracing;

  if (supportedCategoriesForDisabling.has(category)) {
    if (tracingCfg?.[category]?.disable === true) {
      return true;
    }

    if (tracingCfg?.[category]?.[module]?.disable === true) {
      return true;
    }

    // Future scope for direct module disabling:
    // if (tracingCfg?.[module]?.disable === true) return true;
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
  const disableTracers = config?.tracing?.disableTracers || [];
  if (disableTracers.includes(moduleName) || (instrumentationName && disableTracers.includes(instrumentationName))) {
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
