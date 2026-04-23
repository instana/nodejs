/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const util = require('@instana/core/src/config/util');
const validate = require('@instana/core/src/config/validator');

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
  const { value } = util.resolve(
    {
      envValue: 'INSTANA_AGENT_HOST',
      inCodeValue: userConfig.agentHost,
      defaultValue: defaultConfig.agentHost
    },
    [validate.stringValidator]
  );
  return value;
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ agentPort: number }} defaultConfig
 * @returns {number}
 */
function normalizeAgentPort(userConfig, defaultConfig) {
  const { value } = util.resolve(
    {
      envValue: 'INSTANA_AGENT_PORT',
      inCodeValue: userConfig.agentPort,
      defaultValue: defaultConfig.agentPort
    },
    [validate.numberValidator]
  );
  return value;
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ agentRequestTimeout: number }} defaultConfig
 * @returns {number}
 */
function normalizeAgentRequestTimeout(userConfig, defaultConfig) {
  const { value } = util.resolve(
    {
      envValue: 'INSTANA_AGENT_REQUEST_TIMEOUT',
      inCodeValue: userConfig.agentRequestTimeout,
      defaultValue: defaultConfig.agentRequestTimeout
    },
    [validate.numberValidator]
  );
  return value;
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @param {{ autoProfile: boolean }} defaultConfig
 * @returns {boolean}
 */
function normalizeAutoProfile(userConfig, defaultConfig) {
  const { value } = util.resolve(
    {
      envValue: 'INSTANA_AUTO_PROFILE',
      inCodeValue: userConfig.autoProfile,
      defaultValue: defaultConfig.autoProfile
    },
    [validate.booleanValidator]
  );
  return value;
}

/**
 * @param {import('../types/collector').CollectorConfig} userConfig
 * @returns {boolean}
 */
function normalizeUnhandledRejections(userConfig) {
  const { value } = util.resolve(
    {
      inCodeValue: userConfig.reportUnhandledPromiseRejections,
      defaultValue: false
    },
    [validate.booleanValidator]
  );
  return value;
}
