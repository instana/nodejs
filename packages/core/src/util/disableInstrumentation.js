/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let agentConfig;

// Categories that support category-level disabling
const DISABLABLE_CATEGORIES = new Set(['logging', 'databases', 'messaging']);

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
  const disabledConfigs = cfg?.tracing?.disable;

  if (!disabledConfigs?.length) return false;

  // case 1: Handle if the instrumentation/package is enabled in the config
  if (moduleName) {
    const isExcluded = disabledConfigs.some(
      (/** @type {string} */ module) =>
        typeof module === 'string' && module.startsWith('!') && module.slice(1) === moduleName
    );
    if (isExcluded) return false;
  }

  // case2: Handle if the instrumentation/package is disabled in the config
  // Check for instrumentation name ifn module name is not matched
  if (moduleName && disabledConfigs.includes(moduleName)) return true;
  if (instrumentationName && disabledConfigs.includes(instrumentationName)) return true;

  // case3: handle if the category is disabled
  return Boolean(category && DISABLABLE_CATEGORIES.has(category) && disabledConfigs.includes(category));
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
  const { category } = getCategoryAndModule(instrumentationKey) || {};

  const context = { moduleName, instrumentationName, category };

  // Give priority to service-level config
  if (config && shouldDisable(config, context)) {
    return true;
  }

  // Fallback to agent-level config if not disabled above
  // NOTE: We currently have no single config object.
  if (agentConfig && shouldDisable(agentConfig, context)) {
    return true;
  }

  return false;
}

module.exports = {
  init,
  activate,
  isInstrumentationDisabled
};
