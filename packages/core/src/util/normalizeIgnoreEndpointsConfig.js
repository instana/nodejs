/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * Normalizes the ignore endpoints configuration to ensure consistent formatting.
 *
 * Supported input configurations:
 * - Methods can be specified as simple strings or arrays.
 * - Advanced configurations can include both methods and endpoints.
 * - Input is normalized to prevent mismatches due to casing or whitespace.
 *
 * @param {import('../tracing').IgnoreEndpoints} ignoreEndpointConfig
 * @param {import('../core').GenericLogger} _logger
 * @returns {import('../tracing').IgnoreEndpoints} The normalized ignore endpoints configuration.
 */
module.exports = function normalizeIgnoreEndpointsConfig(ignoreEndpointConfig, _logger = logger) {
  try {
    return Object.fromEntries(
      Object.entries(ignoreEndpointConfig).map(([serviceName, endpointConfigs]) => {
        if (!Array.isArray(endpointConfigs)) {
          return [normalizeString(serviceName), []];
        }

        /** @type {string[]} */
        const methods = [];

        /** @type {import('../tracing').IgnoreEndpointsFields[]} */
        const advancedConfigs = [];

        endpointConfigs.forEach(config => {
          if (typeof config === 'string') {
            // If the config is a string, treat it as a method to be ignored.
            methods.push(normalizeString(config));
          } else if (typeof config === 'object' && config !== null) {
            // We need to normalize the keys as well.
            const normalizedConfig = Object.fromEntries(
              Object.entries(config).map(([key, value]) => [normalizeString(key), value])
            );

            /** @type {import('../tracing').IgnoreEndpointsFields} */
            const validConfig = {};

            // Only process allowed fields: "methods" and "endpoints".
            // These are the only supported configurations for ignoring endpoints atm.

            if (normalizedConfig?.methods) {
              validConfig.methods = Array.isArray(normalizedConfig.methods)
                ? normalizedConfig.methods.map(method => normalizeString(method))
                : [normalizeString(normalizedConfig.methods)];
            }

            if (normalizedConfig.endpoints) {
              validConfig.endpoints = Array.isArray(normalizedConfig.endpoints)
                ? normalizedConfig.endpoints.map(endpoint => normalizeString(endpoint))
                : [normalizeString(normalizedConfig.endpoints)];
            }

            if (Object.keys(validConfig).length > 0) {
              advancedConfigs.push(validConfig);
            }
          }
        });

        const normalizedEntries = [];
        if (methods.length > 0) {
          normalizedEntries.push({ methods });
        }
        normalizedEntries.push(...advancedConfigs);

        return [normalizeString(serviceName), normalizedEntries.length > 0 ? normalizedEntries : []];
      })
    );
  } catch (error) {
    _logger?.warn?.('Error processing ignore-endpoints configuration', error?.message);
    return {}; // Extra safety in case of failure
  }
};

/**
 * @param {string} str
 * @returns {string} The formatted string.
 */
function normalizeString(str) {
  return str?.trim()?.toLowerCase();
}
