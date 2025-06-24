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
 *
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.normalize = function normalize(config) {
  if (!config?.tracing) config.tracing = {};

  // Handle deprecated `disabledTracers` property
  if (config.tracing.disabledTracers) {
    logger?.warn(
      'The configuration property "tracing.disabledTracers" is deprecated and will be removed in the next ' +
        'major release. Please use "tracing.disable" with "libraries" instead.'
    );

    if (!config.tracing.disable) {
      config.tracing.disable = { libraries: config.tracing.disabledTracers };
    }

    delete config.tracing.disabledTracers;
  }

  // Populate `tracing.disable` if not already set, using environment variables
  if (!config.tracing.disable) {
    config.tracing.disable = getDisableFromEnv();
  }

  // Normalize the disable configuration
  const disableConfig = config.tracing.disable || {};
  disableConfig.libraries = normalizeArray(disableConfig.libraries);
  // categories are not yet supported, but can be added in the future
  return disableConfig;
};

function getDisableFromEnv() {
  const disable = {};

  // Fallback to deprecated variable if defined
  if (process.env.INSTANA_DISABLED_TRACERS) {
    logger?.warn(
      'The environment variable "INSTANA_DISABLED_TRACERS" is deprecated and will be removed in the next ' +
        'major release. Use "INSTANA_TRACING_DISABLE_LIBRARIES" instead.'
    );
    disable.libraries = normalizeArray(parseHeadersEnvVar(process.env.INSTANA_DISABLED_TRACERS));
  }
  if (process.env.INSTANA_TRACING_DISABLE_LIBRARIES) {
    disable.libraries = normalizeArray(parseHeadersEnvVar(process.env.INSTANA_TRACING_DISABLE_LIBRARIES));
  }

  // Future support: parse disable categories from env if available

  return Object.keys(disable).length > 0 ? disable : null;
}

/**
 * @param {string} envVarValue
 * @returns {string[]}
 */
function parseHeadersEnvVar(envVarValue) {
  return envVarValue
    .split(/[;,]/)
    .map(header => header.trim())
    .filter(header => header !== '');
}

/**
 * @param {any[]} arr
 * @returns {string[]}
 */
function normalizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(s => s.toLowerCase()?.trim()).filter(Boolean);
}
