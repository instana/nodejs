/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const { read } = require('../yamlReader');
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

            if (normalizedCfg.connections) {
              validConfig.connections = [].concat(normalizedCfg.connections).map(normalizeString);
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
exports.fromEnv = function fromEnv(ignoreEndpointsEnv) {
  try {
    if (!ignoreEndpointsEnv) {
      return {};
    }

    const parsedConfig = ignoreEndpointsEnv
      .split(';')
      .map(serviceEntry => {
        const [serviceName, endpointList] = (serviceEntry || '').split(':').map(part => part.trim());

        if (!serviceName || !endpointList) {
          logger?.warn(
            // eslint-disable-next-line max-len
            `Invalid configuration: entry in INSTANA_IGNORE_ENDPOINTS ${ignoreEndpointsEnv}: "${serviceEntry}". Expected format is e.g. "service:endpoint1,endpoint2".`
          );
          return null;
        }

        return { [serviceName]: endpointList.split(',') };
      })
      .filter(Boolean);

    return exports.normalizeConfig(Object.assign({}, ...parsedConfig));
  } catch (error) {
    logger?.warn(`Failed to parse INSTANA_IGNORE_ENDPOINTS: ${ignoreEndpointsEnv}. Error: ${error?.message}`);
    return {};
  }
};

/**
 * Reads and normalizes the `INSTANA_IGNORE_ENDPOINTS_PATH` configuration from a YAML file.
 *
 * - The YAML file must have a root key of either `tracing` or `com.instana.tracing`.
 * - If `com.instana.tracing` is detected, it will be logged and automatically mapped to `tracing`.
 * - Returns an empty object if the file is missing, malformed, or improperly structured.
 *
 * @param {string} yamlFilePath
 */
exports.fromYaml = function fromYaml(yamlFilePath) {
  if (!path.isAbsolute(yamlFilePath)) {
    logger?.warn(
      // eslint-disable-next-line max-len
      `Invalid configuration: INSTANA_IGNORE_ENDPOINTS_PATH file path ${yamlFilePath} is not absolute.`
    );
    return {};
  }
  /** @type {Record<string, any>} */
  const endpointsConfig = read(yamlFilePath);
  if (!endpointsConfig || typeof endpointsConfig !== 'object') {
    logger?.debug(
      // eslint-disable-next-line max-len
      `Invalid configuration: INSTANA_IGNORE_ENDPOINTS_PATH value is not valid, got: ${typeof endpointsConfig}. Provide valid YAML file`
    );
    return {};
  }

  if (!endpointsConfig.tracing && !endpointsConfig['com.instana.tracing']) {
    logger?.debug('Invalid configuration: INSTANA_IGNORE_ENDPOINTS_PATH root key must be "tracing".');
    return {};
  }

  if (endpointsConfig['com.instana.tracing']) {
    logger?.info(
      // eslint-disable-next-line max-len
      `Detected the root key "com.instana.tracing" in the YAML file at "${yamlFilePath}". This format is accepted, but please migrate to using "tracing" as the root key.`
    );
    endpointsConfig.tracing = endpointsConfig['com.instana.tracing'];
    delete endpointsConfig['com.instana.tracing'];
  }
  return exports.normalizeConfig(endpointsConfig.tracing['ignore-endpoints']) || {};
};

/**
 * Normalizes a string by trimming whitespace and converting it to lowercase.
 * @param {string} str
 * @returns {string}
 */
function normalizeString(str) {
  return str?.trim()?.toLowerCase();
}
