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
  tracing: {
    stackTrace: 'all',
    stackTraceLength: 10
  },
  autoProfile: false
};

const validStackTraceModes = ['error', 'all', 'none'];

/**
 * Merges the config that was passed to the init function with environment variables and default values.
 * @param {import('../types/collector').CollectorConfig} config
 * @returns {import('../types/collector').CollectorConfig}
 */
module.exports = function normalizeConfig(config = {}) {
  config.agentHost = config.agentHost || process.env.INSTANA_AGENT_HOST || defaults.agentHost;
  config.agentPort = config.agentPort || parseToPositiveInteger(process.env.INSTANA_AGENT_PORT, defaults.agentPort);
  config.agentRequestTimeout =
    config.agentRequestTimeout ||
    parseToPositiveInteger(process.env.INSTANA_AGENT_REQUEST_TIMEOUT, defaults.agentRequestTimeout);

  config.autoProfile = config.autoProfile || process.env.INSTANA_AUTO_PROFILE || defaults.autoProfile;
  config.tracing = config.tracing || {};

  // Normalize stack trace mode
  if (process.env.INSTANA_STACK_TRACE) {
    const envValue = process.env.INSTANA_STACK_TRACE.toLowerCase();
    if (validStackTraceModes.includes(envValue)) {
      config.tracing.stackTrace = envValue;
    } else {
      config.tracing.stackTrace = defaults.tracing.stackTrace;
    }
  } else if (config.tracing.stackTrace != null) {
    const configValue = typeof config.tracing.stackTrace === 'string' ? config.tracing.stackTrace.toLowerCase() : null;
    if (configValue && validStackTraceModes.includes(configValue)) {
      config.tracing.stackTrace = configValue;
    } else {
      config.tracing.stackTrace = defaults.tracing.stackTrace;
    }
  } else {
    config.tracing.stackTrace = defaults.tracing.stackTrace;
  }

  if (config.tracing.stackTraceLength == null) {
    config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
  }

  if (config.reportUnhandledPromiseRejections == null) {
    config.reportUnhandledPromiseRejections = false;
  }

  return config;
};

/**
 * @param {string | number} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseToPositiveInteger(value, defaultValue) {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  value = parseInt(value, 10);
  if (!isNaN(value)) {
    return Math.abs(Math.round(value));
  }
  return defaultValue;
}
