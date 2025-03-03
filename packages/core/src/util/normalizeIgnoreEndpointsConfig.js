/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * Normalizes the ignore endpoints configuration to ensure consistent internal formatting.
 *
 * Supported input formats:
 * - Strings: Represent methods to be ignored.
 * - Objects: Contain `methods` and/or `endpoints` fields for more granular control.
 *
 * @param {import('../tracing').IgnoreEndpoints} ignoreEndpointConfig
 * @param {import('../core').GenericLogger} _logger
 * @returns {import('../tracing').IgnoreEndpoints}
 */
module.exports = function normalizeIgnoreEndpointsConfig(ignoreEndpointConfig, _logger = logger) {
  if (!ignoreEndpointConfig || typeof ignoreEndpointConfig !== 'object') {
    return {};
  }
  try {
    return Object.fromEntries(
      Object.entries(ignoreEndpointConfig).map(([serviceName, endpointConfigs]) => {
        if (!Array.isArray(endpointConfigs)) return [normalizeString(serviceName), []];

        // Normalize method names from string-based configurations
        const methodNames = /** @type {string[]} */ (endpointConfigs.filter(config => typeof config === 'string')).map(
          normalizeString
        );

        // Normalize object-based configurations
        const advancedConfigs = endpointConfigs
          .filter(config => typeof config === 'object' && config !== null)
          .map(config => {
            // Normalize the keys of the configuration object
            const normalizedConfig = Object.fromEntries(
              Object.entries(config).map(([key, value]) => [normalizeString(key), value])
            );
            const validConfig = {};
            if (normalizedConfig.methods) {
              validConfig.methods = [].concat(normalizedConfig.methods).map(normalizeString);
            }
            if (normalizedConfig.endpoints) {
              validConfig.endpoints = [].concat(normalizedConfig.endpoints).map(normalizeString);
            }
            return Object.keys(validConfig).length ? validConfig : null;
          })
          .filter(Boolean);

        // Combine string-based and object-based configurations.
        const normalizedConfigs = methodNames.length ? [{ methods: methodNames }, ...advancedConfigs] : advancedConfigs;
        return [normalizeString(serviceName), normalizedConfigs];
      })
    );
  } catch (error) {
    _logger?.warn?.('Error processing ignore-endpoints configuration', error?.message);
    return {};
  }
};

/**
 * Normalizes a string by trimming whitespace and converting it to lowercase.
 * @param {string} str
 * @returns {string}
 */
function normalizeString(str) {
  return str?.trim()?.toLowerCase();
}
