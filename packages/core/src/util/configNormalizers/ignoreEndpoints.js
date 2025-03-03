/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/** @type {import('../../core').GenericLogger} */
let logger;
/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

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
 * @param {import('../../tracing').IgnoreEndpoints} ignoreEndpointConfig
 * @returns {import('../../tracing').IgnoreEndpoints}
 */

exports.normalizeConfig = function normalizeConfig(ignoreEndpointConfig) {
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
    logger?.warn('Error when parsing ignore-endpoints configuration', error?.message);
    return {};
  }
};

/**
 * Parses the `INSTANA_IGNORE_ENDPOINTS` environment variable.
 * Only basic filtering supported by this env variable.
 * Expected format: - "service:endpoint1,endpoint2"
 * @param {string} ignoreEndpointsEnv
 */
exports.parseIgnoreEndpointsFromEnv = function parseIgnoreEndpointsFromEnv(ignoreEndpointsEnv) {
  try {
    if (!ignoreEndpointsEnv) {
      return {};
    }
    return Object.fromEntries(
      ignoreEndpointsEnv
        .split(';')
        .map(serviceEntry => {
          const [serviceName, endpointList] = (serviceEntry || '').split(':').map(part => part.trim());

          if (!serviceName || !endpointList) {
            logger?.warn(
              // eslint-disable-next-line max-len
              `Invalid entry in INSTANA_IGNORE_ENDPOINTS ${ignoreEndpointsEnv}: "${serviceEntry}". Expected format is e.g. "service:endpoint1,endpoint2".`
            );
            return null;
          }
          return [
            serviceName.toLowerCase(),
            [{ methods: endpointList.split(',').map(endpoint => normalizeString(endpoint)) }]
          ];
        })
        .filter(Boolean)
    );
  } catch (error) {
    logger?.warn(`Failed to parse INSTANA_IGNORE_ENDPOINTS: ${ignoreEndpointsEnv}. Error: ${error?.message}`);
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
