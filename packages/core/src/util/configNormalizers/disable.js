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
 * Normalizes the tracing `disable` configuration.
 * Handles deprecated properties, environment variables, and array inputs.
 *
 * Precedence order (highest to lowest):
 * 1. `tracing.disable.instrumentations` and `tracing.disable.groups`
 * 2. `tracing.disable` flat
 * 3. `tracing.disabledTracers` (deprecated, fallback only if disable not set)
 * 4. Environment variables (`INSTANA_TRACING_DISABLE*`)
 *
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.normalize = function normalize(config) {
  if (!config?.tracing) config.tracing = {};

  // Handle deprecated `disabledTracers` property
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
};

// Environment variable precedence  (highest to lowest)
// 1. INSTANA_TRACING_DISABLE_INSTRUMENTATIONS and INSTANA_TRACING_DISABLE_GROUPS
// 2. INSTANA_TRACING_DISABLE – supports both instrumentations and groups
// 3. INSTANA_DISABLED_TRACERS – deprecated
function getDisableFromEnv() {
  const disable = {};

  if (process.env.INSTANA_DISABLED_TRACERS) {
    logger?.warn(
      'The environment variable "INSTANA_DISABLED_TRACERS" is deprecated and will be removed in the next ' +
        'major release. Use "INSTANA_TRACING_DISABLE" instead.'
    );
    disable.instrumentations = parseEnvVar(process.env.INSTANA_DISABLED_TRACERS);
  }

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

  // Handle INSTANA_TRACING_DISABLE_GROUPS
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
 * @param {string[]} rawEntries
 * @returns {{ instrumentations?: string[], groups?: string[] }}
 */
function categorizeDisableEntries(rawEntries) {
  /**
   * @type {string[]}
   */
  const instrumentations = [];
  /**
   * @type {string[]}
   */
  const groups = [];

  rawEntries.forEach(entry => {
    if (typeof entry !== 'string') {
      return;
    }
    const name = entry?.toLowerCase()?.trim();
    if (!name) return;

    if (DISABLABLE_INSTRUMENTATION_GROUPS.has(name)) {
      groups.push(name);
    } else {
      instrumentations.push(name);
    }
  });

  const categorized = {};
  if (instrumentations.length > 0) categorized.instrumentations = instrumentations;
  if (groups.length > 0) categorized.groups = groups;

  return categorized;
}
