/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const util = require('@instana/core/src/config/util');

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  util.init(config.logger);
};

const defaults = {
  agentHost: '127.0.0.1',
  agentPort: 42699,
  agentRequestTimeout: 5000,
  autoProfile: false
};

/**
 * Merges the config that was passed to the init function with environment variables and default values.
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @returns {import('../types/collector').CollectorConfig}
 */
function normalizeConfig(userConfig = {}) {
  const finalConfig = {};

  // NOTE: This function only normalizes collector-specific configuration fields.
  // Other userConfig fields (like serviceName, tracing, etc.) are passed through as-is
  // and will be normalized later by core/config when this collector config is passed
  // as extraFinalConfig to core's normalize function.
  finalConfig.agentHost = normalizeAgentHost(userConfig, defaults);
  finalConfig.agentPort = normalizeAgentPort(userConfig, defaults);
  finalConfig.agentRequestTimeout = normalizeAgentRequestTimeout(userConfig, defaults);
  finalConfig.autoProfile = normalizeAutoProfile(userConfig, defaults);
  finalConfig.reportUnhandledPromiseRejections = normalizeUnhandledRejections(userConfig);
  finalConfig.tracing = userConfig.tracing || {};

  return finalConfig;
}

// Export both init and normalizeConfig
// For backward compatibility, also make normalizeConfig the default export
module.exports = normalizeConfig;
module.exports.init = exports.init;
module.exports.normalizeConfig = normalizeConfig;

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ agentHost: string }} defaultConfig
 * @returns {string}
 */
function normalizeAgentHost(userConfig, defaultConfig) {
  return resolveConfig(process.env.INSTANA_AGENT_HOST, userConfig.agentHost, defaultConfig.agentHost);
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ agentPort: number }} defaultConfig
 * @returns {number}
 */
function normalizeAgentPort(userConfig, defaultConfig) {
  return util.resolveNumericConfig({
    envVar: 'INSTANA_AGENT_PORT',
    configValue: userConfig.agentPort,
    defaultValue: defaultConfig.agentPort,
    configPath: 'config.agentPort'
  });
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ agentRequestTimeout: number }} defaultConfig
 * @returns {number}
 */
function normalizeAgentRequestTimeout(userConfig, defaultConfig) {
  return util.resolveNumericConfig({
    envVar: 'INSTANA_AGENT_REQUEST_TIMEOUT',
    configValue: userConfig.agentRequestTimeout,
    defaultValue: defaultConfig.agentRequestTimeout,
    configPath: 'config.agentRequestTimeout'
  });
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ autoProfile: string | boolean }} defaultConfig
 * @returns {string | boolean}
 */
function normalizeAutoProfile(userConfig, defaultConfig) {
  return resolveConfig(process.env.INSTANA_AUTO_PROFILE, userConfig.autoProfile, defaultConfig.autoProfile);
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @returns {boolean}
 */
function normalizeUnhandledRejections(userConfig) {
  return userConfig.reportUnhandledPromiseRejections ?? false;
}

/**
 * @template T
 * @param {T | undefined} envValue
 * @param {T | undefined} configValue
 * @param {T} defaultValue
 * @returns {T}
 */
function resolveConfig(envValue, configValue, defaultValue) {
  if (configValue != null) {
    return configValue;
  }

  if (envValue != null) {
    return envValue;
  }

  return defaultValue;
}
