/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable dot-notation */

'use strict';

const defaults = {
  agentHost: '127.0.0.1',
  agentPort: 42699,
  tracing: {
    stackTraceLength: 10
  },
  autoProfile: false
};

/**
 * Merges the config that was passed to the init function with environment variables and default values.
 */
module.exports = exports = function normalizeConfig(config = {}) {
  config.agentHost = config.agentHost || process.env.INSTANA_AGENT_HOST || defaults.agentHost;
  config.agentPort = config.agentPort || parseToPositiveInteger(process.env.INSTANA_AGENT_PORT, defaults.agentPort);
  config.autoProfile = config.autoProfile || process.env.INSTANA_AUTO_PROFILE || defaults.autoProfile;

  normalizeConfigForUncaughtExceptions(config);

  return config;
};

function normalizeConfigForUncaughtExceptions(config) {
  config.tracing = config.tracing || {};

  if (config.tracing.stackTraceLength == null) {
    config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
  }
  config.reportUncaughtException = config.reportUncaughtException === true;
  // Make reportUncaughtException imply reportUnhandledPromiseRejections, unless explicitly disabled.
  if (config.reportUnhandledPromiseRejections == null) {
    config.reportUnhandledPromiseRejections = config.reportUncaughtException;
  }
}

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
