/* eslint-disable dot-notation */

'use strict';

var defaults = {
  agentHost: '127.0.0.1',
  agentPort: 42699,
  agentName: 'Instana Agent',
  tracing: {
    stackTraceLength: 10
  }
};

/**
 * Merges the config that was passed to the init function with environment variables and default values.
 */
module.exports = exports = function normalizeConfig(config) {
  config = config || {};

  config.agentHost = config.agentHost || process.env.INSTANA_AGENT_HOST || defaults.agentHost;
  config.agentPort = config.agentPort || parseToPositiveInteger(process.env.INSTANA_AGENT_PORT, defaults.agentPort);
  config.agentName = config.agentName || process.env.INSTANA_AGENT_NAME || defaults.agentName;

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
