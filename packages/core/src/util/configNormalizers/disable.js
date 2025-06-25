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
    // Handle deprecated `disabledTracers` config
    if (config.tracing.disabledTracers) {
      logger?.warn(
        'The configuration property "tracing.disabledTracers" is deprecated and will be removed in the next ' +
          'major release. Please use "tracing.disable" instead.'
      );
      if (!config.tracing.disable) {
        config.tracing.disable = { instrumentations: config.tracing.disabledTracers };
      }
      delete config.tracing.disabledTracers;
    }

    let disableConfig = config.tracing.disable;

    // Fallback to environment variables if `disable` is not configured
    if (!disableConfig) {
      disableConfig = getDisableFromEnv();
    }

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
    return {};
  }
};

// Environment variable precedence  (highest to lowest)
// 1. INSTANA_TRACING_DISABLE_INSTRUMENTATIONS and INSTANA_TRACING_DISABLE_GROUPS
// 2. INSTANA_TRACING_DISABLE – supports both instrumentations and groups
// 3. INSTANA_DISABLED_TRACERS – deprecated
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

  // This env var may contains both groups and instrumentations
  if (process.env.INSTANA_TRACING_DISABLE) {
    const categorized = categorizeDisableEntries(parseEnvVar(process.env.INSTANA_TRACING_DISABLE));
    if (categorized?.instrumentations?.length) {
      disable.instrumentations = categorized.instrumentations;
    }
    if (categorized?.groups?.length) {
      disable.groups = categorized.groups;
    }
  }

  if (process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS) {
    disable.instrumentations = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS);
  }

  if (process.env.INSTANA_TRACING_DISABLE_GROUPS) {
    disable.groups = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_GROUPS);
  }

  return Object.keys(disable).length > 0 ? disable : null;
}

/**
 * @param {string} envVarValue
 * @returns {string[]}
 */
function parseEnvVar(envVarValue) {
  if (typeof envVarValue !== 'string') {
    return [];
  }
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
  return arr
    .map(s => {
      if (typeof s !== 'string') {
        return null;
      }
      return s.toLowerCase()?.trim();
    })
    .filter(Boolean);
}

/**
 * Handle a flat array of strings which may include both individual
 * instrumentation names and known instrumentation groups.
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

    // The supported groups are predefined in DISABLABLE_INSTRUMENTATION_GROUPS.
    // If the entry matches one of these, we classify it as a group, otherwise, considered as an instrumentation.
    if (DISABLABLE_INSTRUMENTATION_GROUPS.has(normalizedEntry)) {
      groups.push(normalizedEntry);
    } else {
      instrumentations.push(normalizedEntry);
    }
  });

  /** @type {{ instrumentations?: string[], groups?: string[] }} */
  const categorized = {};
  if (instrumentations.length > 0) categorized.instrumentations = instrumentations;
  if (groups.length > 0) categorized.groups = groups;

  return categorized;
}
