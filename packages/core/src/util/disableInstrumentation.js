/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let agentConfig;

// Categories that support category-level disabling
const DISABLABLE_CATEGORIES = new Set(['logging', 'databases', 'protocols', 'messaging']);

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
 * @param {string} instrumentationPath
 */
function getModuleName(instrumentationPath) {
  // Extracts the module name from the instrumentationPath.
  // Tries to match the pattern './instrumentation/<category>/<module>' and extract the <module> part.
  // If that pattern doesn't match (e.g., in custom instrumentation cases),
  // it falls back to extracting the last segment of the instrumentationPath after the final '/'.
  const matchResult = instrumentationPath.match(/.\/instrumentation\/[^/]*\/(.*)/);
  const moduleName = matchResult ? matchResult[1] : instrumentationPath.match(/\/([^/]+)$/)[1];
  return moduleName.toLowerCase();
}

/**
 * Extracts category and module from an instrumentation instrumentationPath
 * @param {string} instrumentationPath
 * @returns {{category: string, module: string}|null}
 */
function getCategoryAndModule(instrumentationPath) {
  const match = instrumentationPath.match(/\.\/instrumentation\/([^/]+)\/([^/]+)/);
  return match ? { category: match[1], module: match[2] } : null;
}

/**
 * @param {*} cfg
 * @param {object} options
 * @param {string} [options.moduleName]
 * @param {string} [options.instrumentationName]
 * @param {string} [options.category]
 */
function shouldDisable(cfg, { moduleName, instrumentationName, category } = {}) {
  const disabledItems = cfg?.tracing?.disable;

  if (!disabledItems?.length) return false;

  // Handle module exclusion (patterns starting with '!')
  if (moduleName) {
    const isExcluded = disabledItems.some(
      (/** @type {string} */ item) => typeof item === 'string' && item.startsWith('!') && item.slice(1) === moduleName
    );
    if (isExcluded) return false;
  }

  // Check for direct module matches
  if (moduleName && disabledItems.includes(moduleName)) return true;
  if (instrumentationName && disabledItems.includes(instrumentationName)) return true;

  // Check for category disable
  return Boolean(category && DISABLABLE_CATEGORIES.has(category) && disabledItems.includes(category));
}

/**
 * @param {object} params
 * @param {Object.<string, import('../tracing/index').InstanaInstrumentedModule>} [params.instrumentationModules]
 * @param {string} params.instrumentationKey
 * @returns {boolean}
 */
function isInstrumentationDisabled({ instrumentationModules = {}, instrumentationKey }) {
  const moduleName = getModuleName(instrumentationKey);
  const instrumentationName = instrumentationModules[instrumentationKey]?.instrumentationName;
  const categoryModule = getCategoryAndModule(instrumentationKey);

  // Check service config first
  if (
    config &&
    shouldDisable(config, {
      moduleName,
      instrumentationName,
      category: categoryModule?.category
    })
  ) {
    return true;
    // Check agent config if service config does not disable
  } else if (
    agentConfig &&
    shouldDisable(agentConfig, {
      moduleName,
      category: categoryModule?.category
    })
  ) {
    return true;
  }

  return false;
}

module.exports = {
  init,
  activate,
  isInstrumentationDisabled
};
