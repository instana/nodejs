/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { DISABLABLE_INSTRUMENTATION_GROUPS } = require('../../tracing/constants');
/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} _config
 */
exports.init = function init(_config) {
  logger = _config.logger;
};

/**
 * Handles deprecated properties, environment variables, and array inputs.
 *
 * Precedence order (highest to lowest):
 * 1. `tracing.disable`
 * 2. `tracing.disabledTracers` (deprecated)
 * 3. Environment variables (`INSTANA_TRACING_DISABLE*`)
 *
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.normalize = function normalize(config) {
  if (!config?.tracing) config.tracing = {};
  try {
    // Disable all tracing if explicitly set  'disable' to true
    if (config.tracing.disable === true) {
      logger?.info('Tracing has been disabled via "tracing.disable: true" configuration.');
      return true;
    }
    const hasDisableConfig = isDisableConfigNonEmpty(config);

    if (hasDisableConfig) {
      logger?.info(
        `Tracing selectively disabled as per "tracing.disable" configuration: ${JSON.stringify(config.tracing.disable)}`
      );
    }
    // Handle deprecated `disabledTracers` config
    if (config.tracing.disabledTracers) {
      logger?.warn(
        'The configuration property "tracing.disabledTracers" is deprecated and will be removed in the next ' +
          'major release. Please use "tracing.disable" instead.'
      );
      if (!hasDisableConfig) {
        config.tracing.disable = { instrumentations: config.tracing.disabledTracers };
      }
      delete config.tracing.disabledTracers;
    }

    // Fallback to environment variables if `disable` is not explicitly configured
    const disableConfig = isDisableConfigNonEmpty(config) ? config.tracing.disable : getDisableFromEnv();

    if (!disableConfig) return {};

    if (disableConfig === true) return true;

    // Normalize instrumentations and groups
    if (disableConfig?.instrumentations) {
      disableConfig.instrumentations = normalizeArray(disableConfig.instrumentations);
    }
    if (disableConfig?.groups) {
      disableConfig.groups = normalizeArray(disableConfig.groups);
    }

    // Handle if tracing.disable is an array
    if (Array.isArray(disableConfig)) {
      return categorizeDisableEntries(disableConfig);
    }

    return disableConfig || {};
  } catch (error) {
    // Fallback to an empty disable config on error
    logger?.debug(`Error while normalizing tracing.disable config: ${error?.message} ${error?.stack}`);
    return {};
  }
};

/**
 * Handles config from agent.
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.normalizeExternalConfig = function normalizeExternalConfig(config) {
  try {
    if (isNonEmptyObject(config.tracing.disable)) {
      const flattenedEntries = flattenDisableConfigs(config.tracing.disable);
      return categorizeDisableEntries(flattenedEntries);
    }
  } catch (error) {
    logger?.debug(`Error while normalizing external tracing.disable config: ${error?.message} ${error?.stack}`);
  }

  return {};
};

/**
 * Precedence (highest to lowest):
 * 1. INSTANA_TRACING_DISABLE=true/false
 * 2. INSTANA_TRACING_DISABLE_INSTRUMENTATIONS / INSTANA_TRACING_DISABLE_GROUPS
 * 3. INSTANA_TRACING_DISABLE=list
 * 4. INSTANA_DISABLED_TRACERS (deprecated)
 *
 * @returns {import('../../tracing').Disable}
 */
function getDisableFromEnv() {
  const disable = {};

  // @deprecated
  if (process.env.INSTANA_DISABLED_TRACERS) {
    logger?.warn(
      'The environment variable "INSTANA_DISABLED_TRACERS" is deprecated and will be removed in the next ' +
        'major release. Use "INSTANA_TRACING_DISABLE" instead.'
    );
    disable.instrumentations = parseEnvVar(process.env.INSTANA_DISABLED_TRACERS);
  }

  // This env var may contains true/false and also both groups and instrumentations
  if (process.env.INSTANA_TRACING_DISABLE) {
    const envVarValue = process.env.INSTANA_TRACING_DISABLE;

    if (envVarValue === 'true') {
      logger?.info('Tracing has been disabled via environment variable "INSTANA_TRACING_DISABLE=true".');
      return true;
    }

    if (envVarValue !== 'false' && envVarValue !== '') {
      const categorized = categorizeDisableEntries(parseEnvVar(envVarValue));
      if (categorized?.instrumentations?.length) {
        disable.instrumentations = categorized.instrumentations;
      }
      if (categorized?.groups?.length) {
        disable.groups = categorized.groups;
      }

      logger?.info(`Tracing has been disabled via "INSTANA_TRACING_DISABLE=${envVarValue}"`);
    }
  }

  if (process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS) {
    disable.instrumentations = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS);
    logger?.info(
      `Tracing instrumentations disabled via "INSTANA_TRACING_DISABLE_INSTRUMENTATIONS": ${JSON.stringify(
        disable.instrumentations
      )}`
    );
  }

  if (process.env.INSTANA_TRACING_DISABLE_GROUPS) {
    disable.groups = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_GROUPS);
    logger?.info(`Tracing groups disabled via "INSTANA_TRACING_DISABLE_GROUPS": ${JSON.stringify(disable.groups)}`);
  }

  return Object.keys(disable).length > 0 ? disable : null;
}

/**
 * @param {string} envVarValue
 * @returns {string[]}
 */
function parseEnvVar(envVarValue) {
  return envVarValue
    .split(/[;,]/)
    .map(item => item.trim().toLowerCase())
    .filter(item => item !== '');
}

/**
 * @param {any[]} arr
 * @returns {string[]}
 */
function normalizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(s => (typeof s === 'string' ? s.toLowerCase().trim() : null)).filter(Boolean);
}

/**
 * Categorizes a flat array of strings into instrumentations and groups.
 * Supports negated entries (e.g., '!console').
 *
 * @param {string[]} rawEntries
 * @returns {{ instrumentations?: string[], groups?: string[] }}
 */
function categorizeDisableEntries(rawEntries) {
  /** @type {string[]} */
  const instrumentations = [];
  /** @type {string[]} */
  const groups = [];

  rawEntries.forEach(entry => {
    if (typeof entry !== 'string') return;
    const normalizedEntry = entry?.toLowerCase().trim();
    if (!normalizedEntry) return;

    // This allows configurations like { console: false } to be interpreted as '!console',
    // which means "do not disable console" — useful when overriding group disables.
    const isNegated = normalizedEntry.startsWith('!');
    const actualValue = isNegated ? normalizedEntry.slice(1) : normalizedEntry;
    const normalized = isNegated ? `!${actualValue}` : actualValue;

    // The supported groups are predefined in DISABLABLE_INSTRUMENTATION_GROUPS.
    // If the entry matches one of these, we classify it as a group, otherwise, considered as an instrumentation.
    if (DISABLABLE_INSTRUMENTATION_GROUPS.has(actualValue)) {
      groups.push(normalized);
    } else {
      instrumentations.push(normalized);
    }
  });

  const categorized = {};
  if (instrumentations.length > 0) categorized.instrumentations = instrumentations;
  if (groups.length > 0) categorized.groups = groups;

  return categorized;
}

/**
 * @param {*} disableConfig
 * @returns {string[]}
 */
function flattenDisableConfigs(disableConfig) {
  // Converts a config with boolean values into a flat list of strings.
  // Each key is a instrumentation or group.
  // - true - disable
  // - false - enable, we internally formated by adding ! in prefix
  // Example: { logging: true, console: false } => ['logging', '!console']
  return Object.entries(disableConfig).flatMap(([entryName, shouldDisable]) => {
    if (shouldDisable === true) return [entryName];
    if (shouldDisable === false) return [`!${entryName}`];
    return [];
  });
}

/**
 * @param {{}} obj
 */
function isNonEmptyObject(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length > 0;
}

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
function isDisableConfigNonEmpty(config) {
  const disableConfig = config.tracing?.disable;

  return isNonEmptyObject(disableConfig) || (Array.isArray(disableConfig) && disableConfig.length > 0);
}
