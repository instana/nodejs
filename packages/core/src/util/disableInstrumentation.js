/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { DISABLABLE_INSTRUMENTATION_GROUPS } = require('../tracing/constants');

/** @type {import('../util/normalizeConfig').InstanaConfig} */
let config;

/** @type {import('../util/normalizeConfig').AgentConfig} */
let agentConfig;

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
  // Tries to match the pattern './instrumentation/<group>/<module>' and extract the <module> part.
  // If that pattern doesn't match (e.g., in custom instrumentation cases),
  // it falls back to extracting the last segment of the instrumentationPath after the final '/'.
  const matchResult = instrumentationPath.match(/.\/instrumentation\/[^/]*\/(.*)/);
  const moduleName = matchResult ? matchResult[1] : instrumentationPath.match(/\/([^/]+)$/)[1];
  return moduleName.toLowerCase();
}

/**
 * Extracts group and module from an instrumentation instrumentationPath
 * @param {string} instrumentationPath
 * @returns {{group: string, module: string}|null}
 */
function getCategoryAndModule(instrumentationPath) {
  const match = instrumentationPath.match(/\.\/instrumentation\/([^/]+)\/([^/]+)/);
  return match ? { group: match[1], module: match[2] } : null;
}

/**
 * @param {*} cfg
 * @param {object} options
 * @param {string} [options.moduleName]
 * @param {string} [options.instrumentationName]
 * @param {string} [options.group]
 */
function shouldDisable(cfg, { moduleName, instrumentationName, group } = {}) {
  const disableConfig = cfg.tracing?.disable;

  // If neither instrumentations nor groups are configured for disabling, tracing is enabled
  if (!disableConfig?.instrumentations && !disableConfig?.groups) {
    return false;
  }

  // Case 1: Check if module or instrumentation is explicitly disabled
  if (
    (moduleName && disableConfig.instrumentations?.includes(moduleName)) ||
    (instrumentationName && disableConfig.instrumentations?.includes(instrumentationName))
  ) {
    return true;
  }

  // Case 2: Check if the group is marked as disabled
  const isCategoryDisabled =
    group && DISABLABLE_INSTRUMENTATION_GROUPS.has(group) && disableConfig.groups?.includes(group);

  return Boolean(isCategoryDisabled);
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
  const { group } = getCategoryAndModule(instrumentationKey) || {};

  const context = { moduleName, instrumentationName, group };

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
