/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} _config
 */
exports.init = function init(_config) {
  logger = _config.logger;
};

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.normalize = function normalize(config) {
  if (!config?.tracing) config.tracing = {};

  // Handle deprecated `disabledTracers` property
  if (config.tracing.disabledTracers) {
    logger?.warn(
      'The configuration property "tracing.disabledTracers" is deprecated and will be removed in the next ' +
        'major release. Please use "tracing.disable.libraries" instead.'
    );
    if (!config.tracing.disable) {
      config.tracing.disable = { instrumentations: config.tracing.disabledTracers };
    }
    delete config.tracing.disabledTracers;
  }

  let disableConfig = config.tracing.disable;

  // If disable is an array, treat it as instrumentations
  // TODO: add support for groups as well in another PR
  if (Array.isArray(disableConfig)) {
    disableConfig = { instrumentations: disableConfig };
  }

  // If disable is not set, get from environment variables
  if (!disableConfig) {
    disableConfig = getDisableFromEnv();
  }

  // Normalize instrumentations
  if (disableConfig?.instrumentations) {
    disableConfig.instrumentations = normalizeArray(disableConfig.instrumentations);
  }

  return disableConfig || {};
};

function getDisableFromEnv() {
  const disable = {};

  // Fallback to deprecated variable if defined
  if (process.env.INSTANA_DISABLED_TRACERS) {
    logger?.warn(
      'The environment variable "INSTANA_DISABLED_TRACERS" is deprecated and will be removed in the next ' +
        'major release. Use "INSTANA_TRACING_DISABLE" instead.'
    );
    disable.instrumentations = parseEnvVar(process.env.INSTANA_DISABLED_TRACERS);
  }
  // Handle INSTANA_TRACING_DISABLE
  // TODO: add support for groups as well in another PR
  if (process.env.INSTANA_TRACING_DISABLE) {
    disable.instrumentations = parseEnvVar(process.env.INSTANA_TRACING_DISABLE);
  }

  // Handle INSTANA_TRACING_DISABLE_INSTRUMENTATIONS
  if (process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS) {
    disable.instrumentations = parseEnvVar(process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS);
  }

  // TODO: add support for groups as well in another PR
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
  return arr.map(s => s.toLowerCase()?.trim()).filter(Boolean);
}
