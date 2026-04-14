/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { CONFIG_SOURCES } = require('../util/constants');

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * @param {import('../core').GenericLogger} [_logger]
 */
exports.init = _logger => {
  logger = _logger;
};

/**
 * Internal config source wrapper
 * @param {any} value
 * @param {number} source
 */
function wrap(value, source) {
  return {
    value,
    source
  };
}

/**
 * @param {Object} params
 * @param {string} params.envVar
 * @param {number|string|undefined|null} params.configValue
 * @param {number} params.defaultValue
 * @param {string} params.configPath
 * @returns {{value:number,source:number}}
 */
exports.resolveNumericConfig = function resolveNumericConfig({ envVar, configValue, defaultValue, configPath }) {
  const envRaw = process.env[envVar];

  /** @param {number|string|null|undefined} val */
  const toValidNumber = val => {
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isNaN(num) ? undefined : num;
  };

  if (envRaw != null) {
    const envParsed = toValidNumber(envRaw);
    if (envParsed !== undefined) {
      logger.debug(`[config] env:${envVar} = ${envParsed}`);
      return wrap(envParsed, CONFIG_SOURCES.ENV);
    }

    logger.warn(`Invalid numeric value from env:${envVar}: "${envRaw}". Ignoring and checking config value.`);
  }

  if (configValue != null) {
    const configParsed = toValidNumber(configValue);
    if (configParsed !== undefined) {
      logger.debug(`[config] incode:${configPath} = ${configValue}`);
      return wrap(configParsed, CONFIG_SOURCES.IN_CODE);
    }

    logger.warn(
      `Invalid numeric value for ${configPath} from config: "${configValue}". Falling back to default: ${defaultValue}.`
    );
  }

  return wrap(defaultValue, CONFIG_SOURCES.DEFAULT);
};

/**
 * @param {string|undefined} envValue
 * @returns {boolean|undefined}
 */
function parseBooleanFromEnv(envValue) {
  if (envValue == null) {
    return undefined;
  }

  const normalized = envValue.toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

/**
 * @param {Object} params
 * @param {string} params.envVar
 * @param {boolean|undefined|null} params.configValue
 * @param {boolean} params.defaultValue
 * @param {string} [params.configPath]
 * @returns {{value:boolean,source:number}}
 */
exports.resolveBooleanConfig = function resolveBooleanConfig({ envVar, configValue, defaultValue, configPath }) {
  const envValue = process.env[envVar];
  const envParsed = parseBooleanFromEnv(envValue);

  if (envParsed !== undefined) {
    logger.debug(`[config] env:${envVar} = ${envParsed}`);
    return wrap(envParsed, CONFIG_SOURCES.ENV);
  }

  if (envValue != null) {
    logger.warn(`Invalid boolean value for ${envValue}: "${envValue}".`);
  }

  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return wrap(configValue, CONFIG_SOURCES.IN_CODE);
  }

  if (configValue != null && configPath) {
    logger.warn(
      `Invalid configuration: ${configPath} is not a boolean value, will be ignored: ${JSON.stringify(
        configValue
      )}. Falling back to default: ${defaultValue}.`
    );
  }

  return wrap(defaultValue, CONFIG_SOURCES.DEFAULT);
};

/**
 * special cases:
 * eg: "INSTANA_DISABLE_USE_OPENTELEMETRY" where env var presence means false in the config "useOpentelemetry".
 *
 * @param {Object} params
 * @param {string} params.envVar - Environment variable name (e.g., INSTANA_DISABLE_X)
 * @param {boolean|undefined|null} params.configValue - Config value
 * @param {boolean} params.defaultValue - Default value
 * @param {string} [params.configPath] - Config path for logging (optional)
 * @returns {{value:boolean,source:number}}
 */
exports.resolveBooleanConfigWithInvertedEnv = function resolveBooleanConfigWithInvertedEnv({
  envVar,
  configValue,
  defaultValue,
  configPath
}) {
  const envValue = process.env[envVar];
  const envParsed = parseBooleanFromEnv(envValue);

  if (envParsed !== undefined) {
    const invertedValue = !envParsed;
    logger.debug(`[config] env:${envVar} = ${envParsed} (inverted to ${invertedValue})`);
    return wrap(invertedValue, CONFIG_SOURCES.ENV);
  }

  if (envValue != null) {
    logger.warn(`Invalid boolean value for ${envVar}: "${envValue}". Checking in-code config.`);
  }

  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return wrap(configValue, CONFIG_SOURCES.IN_CODE);
  }

  if (configValue != null && configPath) {
    logger.warn(
      `Invalid configuration: ${configPath} is not a boolean value, will be ignored: ${JSON.stringify(
        configValue
      )}. Falling back to default: ${defaultValue}.`
    );
  }

  return wrap(defaultValue, CONFIG_SOURCES.DEFAULT);
};

/**
 * Returns true if env var exists and is truthy, otherwise uses config or default.
 * eg: "INSTANA_DISABLE_W3C_TRACE_CORRELATION" where env var presence means true in the config .
 *
 * @param {Object} params
 * @param {string} params.envVar - Environment variable name
 * @param {boolean|undefined|null} params.configValue - Config value
 * @param {boolean} params.defaultValue - Default value
 * @param {string} [params.configPath]
 * @returns {{value:boolean,source:number}}
 */
exports.resolveBooleanConfigWithTruthyEnv = function resolveBooleanConfigWithTruthyEnv({
  envVar,
  configValue,
  defaultValue,
  configPath
}) {
  // Priority 1: Environment variable
  const envValue = process.env[envVar];
  if (envValue) {
    logger.debug(`[config] env:${envVar} = ${envValue}`);
    return wrap(true, CONFIG_SOURCES.ENV);
  }

  // Priority 2: In-code configuration
  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return wrap(configValue, CONFIG_SOURCES.IN_CODE);
  }
  // Priority 3: Default value
  return wrap(defaultValue, CONFIG_SOURCES.DEFAULT);
};

/**
 * @param {Object} params
 * @param {any} params.envVar
 * @param {any} params.configValue
 * @param {any} params.defaultValue
 * @param {string} [params.configPath]
 * @returns {{value:any,source:number}}
 */
exports.resolveStringConfig = function resolveStringConfig({ envVar, configValue, defaultValue, configPath }) {
  // Priority 1: Environment variable
  const envValue = process.env[envVar];
  if (envValue != null) {
    logger.debug(`[config] env:${envVar} = ${envValue}`);
    return wrap(envValue, CONFIG_SOURCES.ENV);
  }

  // Priority 2: In-code configuration
  if (configValue != null) {
    if (typeof configValue !== 'string') {
      logger.warn(
        `Invalid configuration: ${configPath} is not a string value, will be ignored: ${JSON.stringify(
          configValue
        )}. Falling back to default: ${defaultValue}.`
      );
      return wrap(defaultValue, CONFIG_SOURCES.DEFAULT);
    }

    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return wrap(configValue, CONFIG_SOURCES.IN_CODE);
  }

  return wrap(defaultValue, CONFIG_SOURCES.DEFAULT);
};
