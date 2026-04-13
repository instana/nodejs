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
  // Priority 1: Environment variable
  const envValue = process.env[envVar];
  const envParsed = parseBooleanFromEnv(envValue);

  if (envParsed !== undefined) {
    logger.debug(`[config] env:${envVar} = ${envParsed}`);
    return envParsed;
  }

  if (envValue != null) {
    logger.warn(`Invalid boolean value for ${envValue}: "${envValue}".`);
  }

  // Priority 2: In-code configuration
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

  // Priority 3: Default value
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
  // Priority 1: Environment variable
  const envValue = process.env[envVar];
  const envParsed = parseBooleanFromEnv(envValue);

  if (envParsed !== undefined) {
    const invertedValue = !envParsed;
    logger.debug(`[config] env:${envVar} = ${envParsed} (inverted to ${invertedValue})`);
    return invertedValue;
  }

  if (envValue != null) {
    logger.warn(`Invalid boolean value for ${envVar}: "${envValue}". Checking in-code config.`);
  }

  // Priority 2: In-code configuration
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

  // Priority 3: Default value
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
  // Priority 1: Environment variable
  const envValue = process.env[envVar];
  if (envValue) {
    logger.debug(`[config] env:${envVar} = ${envValue}`);
    return true;
  }

  // Priority 2: In-code configuration
  if (typeof configValue === 'boolean') {
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return configValue;
  }

  // Priority 3: Default value
  return defaultValue;
};

/**
 * @param {Object} params
 * @param {any} params.envVar
 * @param {any} params.configValue
 * @param {any} params.defaultValue
 * @param {string} [params.configPath]
 */
exports.resolveStringConfig = function resolveStringConfig({ envVar, configValue, defaultValue, configPath }) {
  // Priority 1: Environment variable
  const envValue = process.env[envVar];
  if (envValue != null) {
    logger.debug(`[config] env:${envVar} = ${envValue}`);
    return envValue;
  }

  // Priority 2: In-code configuration
  if (configValue != null) {
    if (typeof configValue !== 'string') {
      logger.warn(
        `Invalid configuration: ${configPath} is not a string value, will be ignored: ${JSON.stringify(
          configValue
        )}. Falling back to default: ${defaultValue}.`
      );
      return defaultValue;
    }
    logger.debug(`[config] incode:${configPath} = ${configValue}`);
    return configValue;
  }
  return defaultValue;
};

/**
 * @param {any} value
 */
function isEmpty(value) {
  if (value === undefined || value === null) return true;

  if (typeof value === 'string') return value.trim() === '';

  if (Array.isArray(value)) return value.length === 0;

  if (typeof value === 'object') return Object.keys(value).length === 0;

  return false;
}

/**
 * @param {any} value
 */
function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {any[]} a
 * @param {string | any[]} b
 * @returns {boolean}
 */
function isEqual(a, b) {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((val, i) => isEqual(val, b[i]));
  }

  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    return aKeys.length === bKeys.length && aKeys.every(key => isEqual(a[key], b[key]));
  }

  return false;
}

/**
 * @param {Object} params
 * @param {any} params.currentValue
 * @param {any} params.externalValue
 * @param {any} params.defaultValue
 */
exports.resolveExternalConfig = function resolveExternalConfig({ currentValue, externalValue, defaultValue }) {
  // 1. Ignore empty external values
  if (isEmpty(externalValue)) {
    return currentValue;
  }

  // 2. Handle nested objects
  if (isObject(externalValue)) {
    const result = isObject(currentValue) ? { ...currentValue } : {};

    Object.keys(externalValue).forEach(key => {
      result[key] = resolveExternalConfig({
        currentValue: currentValue ? currentValue[key] : undefined,
        externalValue: externalValue[key],
        defaultValue: defaultValue ? defaultValue[key] : undefined
      });
    });

    return result;
  }

  // 3. If current not set → take external
  if (currentValue === undefined) {
    return externalValue;
  }

  // 4. If current equals default → override (FIXED)
  if (isEqual(currentValue, defaultValue)) {
    return externalValue;
  }

  // 5. Otherwise keep current
  return currentValue;
};
