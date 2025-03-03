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
  try {
    return Object.fromEntries(
      Object.entries(ignoreEndpointConfig).map(([serviceName, endpointConfigs]) => {
        if (!Array.isArray(endpointConfigs)) return [normalizeString(serviceName), []];

        // Normalize only if simple methods are in config.
        const methods = endpointConfigs.filter(config => typeof config === 'string').map(normalizeString);

        // Normalize advanced configurations (objects with `methods` and/or `endpoints`)
        const advancedConfigs = endpointConfigs
          .filter(config => typeof config === 'object' && config !== null)
          .map(config => {
            const validConfig = {};

            if (config.methods) {
              validConfig.methods = [].concat(config.methods).map(normalizeString);
            }

            if (config.endpoints) {
              validConfig.endpoints = [].concat(config.endpoints).map(normalizeString);
            }
            // Extend normalization for additional fields if needed

            return Object.keys(validConfig).length ? validConfig : null;
          })
          .filter(Boolean);

        return [normalizeString(serviceName), methods.length ? [{ methods }, ...advancedConfigs] : advancedConfigs];
      })
    );
  } catch (error) {
    _logger?.warn?.('Error processing ignore-endpoints configuration', error?.message);
    return {};
  }
};

/**
 * Normalizes a string by trimming and converting it to lowercase.
 * Ensures uniform comparison and consistency across configurations.
 *
 * @param {string} str - The string to normalize.
 * @returns {string} The normalized string.
 */
function normalizeString(str) {
  return str?.trim()?.toLowerCase();
}
