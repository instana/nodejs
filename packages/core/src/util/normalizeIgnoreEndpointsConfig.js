/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * Standardizes the ignore endpoints configuration to ensure consistent internal formatting.
 *
 * Acceptable input formats:
 * - Strings or arrays of strings: These are interpreted as methods to ignore.
 * - Objects: Should include `methods` and/or `endpoints` properties.
 *
 * Normalized internal structure:
 * - { [serviceName: string]: [{ methods: string[], endpoints: string[] }] }
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
      Object.entries(ignoreEndpointConfig).map(([service, endpointConfigs]) => {
        if (!Array.isArray(endpointConfigs)) {
          return [normalizeString(service), []];
        }

        // Normalize string-based configurations by treating each string as a method name.
        const methodNames = /** @type {string[]} */ (endpointConfigs.filter(config => typeof config === 'string')).map(
          normalizeString
        );

        // Normalize object-based configurations that may include 'methods' and/or 'endpoints'.
        const advancedConfigs = endpointConfigs
          .filter(config => typeof config === 'object' && config !== null)
          .map(config => {
            // Normalize configuration keys to support case-insensitivity.
            const normalizedCfg = Object.fromEntries(
              Object.entries(config).map(([key, value]) => [normalizeString(key), value])
            );
            const validConfig = {};
            if (normalizedCfg.methods) {
              validConfig.methods = [].concat(normalizedCfg.methods).map(normalizeString);
            }
            if (normalizedCfg.endpoints) {
              validConfig.endpoints = [].concat(normalizedCfg.endpoints).map(normalizeString);
            }
            // extend the config with more fields here
            return Object.keys(validConfig).length ? validConfig : null;
          })
          .filter(Boolean);

        // Combine both string-based and object-based configurations.
        const normalizedConfigs = methodNames.length ? [{ methods: methodNames }, ...advancedConfigs] : advancedConfigs;
        return [normalizeString(service), normalizedConfigs];
      })
    );
  } catch (error) {
    _logger?.warn?.('Error when parsing ignore-endpoints configuration', error?.message);
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
