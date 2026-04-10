/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { DISABLABLE_INSTRUMENTATION_GROUPS } = require('../../tracing/constants');
/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../config').InstanaConfig} _config
 */
exports.init = function init(_config) {
  logger = _config.logger;
};

/**
 * Handles environment variables, and array inputs.
 *
 * Precedence order (highest to lowest):
 * 1. Environment variables (`INSTANA_TRACING_DISABLE*`)
 * 2. In-code tracing.disable
 *
 * @param {import('../../config').InstanaConfig} config
 */
exports.normalize = function normalize(config) {
  if (!config?.tracing) config.tracing = {};
  try {
    const envDisableConfig = getDisableFromEnv();

    if (envDisableConfig !== null) {
      if (envDisableConfig === true) {
        logger?.debug('[config] env:INSTANA_TRACING_DISABLE = true');
        return true;
      }

      if (envDisableConfig === false) {
        logger?.debug('[config] env:INSTANA_TRACING_DISABLE = false (overrides in-code config)');
        return {};
      }

      if (envDisableConfig.instrumentations?.length || envDisableConfig.groups?.length) {
        logger?.debug(`[config] env:INSTANA_TRACING_DISABLE* = ${JSON.stringify(envDisableConfig)}`);

        if (envDisableConfig.instrumentations) {
          envDisableConfig.instrumentations = normalizeArray(envDisableConfig.instrumentations);
        }
        if (envDisableConfig.groups) {
          envDisableConfig.groups = normalizeArray(envDisableConfig.groups);
        }

        return envDisableConfig;
      }
    }

    if (config.tracing.disable === true) {
      logger?.debug('[config] incode:tracing.disable = true');
      return true;
    }

    const hasDisableConfig = isDisableConfigNonEmpty(config);

    if (hasDisableConfig) {
      logger?.debug(`[config] incode:tracing.disable = ${JSON.stringify(config.tracing.disable)}`);
    }

    const disableConfig = isDisableConfigNonEmpty(config) ? config.tracing.disable : null;

    if (!disableConfig) return {};

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
 * @param {import('../../config').InstanaConfig} config
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
 *
 * @returns {import('../../config/types').Disable | boolean | null}
 */
function getDisableFromEnv() {
  const disable = {};

  // This env var may contains true/false and also both groups and instrumentations
  if (process.env.INSTANA_TRACING_DISABLE) {
    const envVarValue = process.env.INSTANA_TRACING_DISABLE;

    if (envVarValue === 'true') {
      logger?.debug('[config] env:INSTANA_TRACING_DISABLE = true');
      return true;
    }

    if (envVarValue === 'false') {
      logger?.debug('[config] env:INSTANA_TRACING_DISABLE = false');
      return false;
    }

    if (envVarValue !== '') {
      const categorized = categorizeDisableEntries(parseEnvVar(envVarValue));
      if (categorized?.instrumentations?.length) {
        disable.instrumentations = categorized.instrumentations;
      }
      if (categorized?.groups?.length) {
        disable.groups = categorized.groups;
      }

      logger?.debug(`[config] env:INSTANA_TRACING_DISABLE = ${envVarValue}`);
    }
  }

  if (process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS) {
    disable.instrumentations = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS);
    logger?.debug(
      `[config] env:INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = ${process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS}`
    );
  }

  if (process.env.INSTANA_TRACING_DISABLE_GROUPS) {
    disable.groups = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_GROUPS);
    logger?.debug(`[config] env:INSTANA_TRACING_DISABLE_GROUPS = ${process.env.INSTANA_TRACING_DISABLE_GROUPS}`);
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
 * @param {import('../../config').InstanaConfig} config
 */
function isDisableConfigNonEmpty(config) {
  const disableConfig = config.tracing?.disable;

  return isNonEmptyObject(disableConfig) || (Array.isArray(disableConfig) && disableConfig.length > 0);
}
