/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable dot-notation */

'use strict';

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
module.exports = function normalizeConfig(userConfig = {}) {
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
};

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
  return resolveNumericConfig(process.env.INSTANA_AGENT_PORT, userConfig.agentPort, defaultConfig.agentPort);
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ agentRequestTimeout: number }} defaultConfig
 * @returns {number}
 */
function normalizeAgentRequestTimeout(userConfig, defaultConfig) {
  return resolveNumericConfig(
    process.env.INSTANA_AGENT_REQUEST_TIMEOUT,
    userConfig.agentRequestTimeout,
    defaultConfig.agentRequestTimeout
  );
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

/**
 * @param {string | undefined} envValue
 * @param {number | undefined} configValue
 * @param {number} defaultValue
 * @returns {number}
 */
function resolveNumericConfig(envValue, configValue, defaultValue) {
  if (configValue != null) {
    return configValue;
  }

  const parsedEnv = parseToPositiveInteger(envValue);
  if (parsedEnv != null) {
    return parsedEnv;
  }
  return defaultValue;
}

/**
 * @param {string | number | undefined} value
 * @returns {number | null}
 */
function parseToPositiveInteger(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!isNaN(parsed)) {
    return Math.abs(Math.round(parsed));
  }

  return null;
}
