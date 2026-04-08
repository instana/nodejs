/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * @param {import('../core').GenericLogger} [_logger]
 */
exports.init = _logger => {
  logger = _logger;
};

/**
 * @param {Object} params
 * @param {string} params.envVar
 * @param {number|string|undefined|null} params.configValue
 * @param {number} params.defaultValue
 * @param {string} params.configPath
 * @returns {number}
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
      return envParsed;
    }

    logger.warn(`Invalid numeric value from env:${envVar}: "${envRaw}". Ignoring and checking config value.`);
  }

  if (configValue != null) {
    const configParsed = toValidNumber(configValue);
    if (configParsed !== undefined) {
      logger.debug(`[config] incode:${configPath} = ${configValue}`);
      return configParsed;
    }

    logger.warn(
      `Invalid numeric value for ${configPath} from config: "${configValue}". Falling back to default: ${defaultValue}.`
    );
  }

  return defaultValue;
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
 * @returns {boolean}
 */
exports.resolveBooleanConfig = function resolveBooleanConfig({ envVar, configValue, defaultValue, configPath }) {
  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return configValue;
  }

  if (configValue != null && configPath) {
    logger.warn(
      `Invalid configuration: ${configPath} is not a boolean value, will be ignored: ${JSON.stringify(
        configValue
      )}. Falling back to default: ${defaultValue}.`
    );
  }

  const envValue = process.env[envVar];
  const envParsed = parseBooleanFromEnv(envValue);

  if (envParsed !== undefined) {
    logger.debug(`[config] env:${envVar} = ${envParsed}`);
    return envParsed;
  }

  if (envValue != null) {
    logger.warn(`Invalid boolean value for ${envValue}: "${envValue}".`);
  }

  return defaultValue;
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
 * @returns {boolean}
 */
exports.resolveBooleanConfigWithInvertedEnv = function resolveBooleanConfigWithInvertedEnv({
  envVar,
  configValue,
  defaultValue,
  configPath
}) {
  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);

    return configValue;
  }

  const envValue = process.env[envVar];
  if (envValue === 'true') {
    logger.debug(`[config] env:${envVar} = true (inverted to false)`);
    return false;
  }

  if (configValue != null && configPath) {
    logger.warn(
      `Invalid configuration: ${configPath} is not a boolean value, will be ignored: ${JSON.stringify(
        configValue
      )}. Falling back to default: ${defaultValue}.`
    );
  }

  return defaultValue;
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
 * @returns {boolean}
 */
exports.resolveBooleanConfigWithTruthyEnv = function resolveBooleanConfigWithTruthyEnv({
  envVar,
  configValue,
  defaultValue,
  configPath
}) {
  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return configValue;
  }

  const envValue = process.env[envVar];
  if (envValue) {
    logger.debug(`[config] env:${envVar} = ${envValue}`);
    return true;
  }

  return defaultValue;
};

/**
 * @param {Object} params
 * @param {any} params.envVar
 * @param {any} params.configValue
 * @param {any} params.defaultValue
 * @param {string} [params.configPath]
 */
exports.resolveConfig = function resolveConfig({ envVar, configValue, defaultValue, configPath }) {
  if (configValue != null) {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return configValue;
  }

  const envValue = process.env[envVar];
  if (envValue != null) {
    logger.debug(`[config] env:${envVar} = ${envValue}`);
    return envValue;
  }

  return defaultValue;
};
