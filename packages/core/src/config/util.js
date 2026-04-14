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

// ============================================================================
// Dynamic Config Resolution
// ============================================================================

/**
 * @enum {string}
 */
const SOURCE = {
  ENV: 'ENV',
  IN_CODE: 'IN_CODE',
  AGENT: 'AGENT',
  DEFAULT: 'DEFAULT'
};

/**
 * Configuration source priority levels
 * Higher number = higher priority in precedence resolution
 *
 * To change precedence, simply modify the numbers here.
 * For example, to make AGENT higher priority than IN_CODE:
 *   AGENT: 3, IN_CODE: 2
 *
 * @type {Record<string, number>}
 */
const SOURCE_PRIORITY = {
  [SOURCE.ENV]: 4,
  [SOURCE.IN_CODE]: 3,
  [SOURCE.AGENT]: 2,
  [SOURCE.DEFAULT]: 1
};
/**
 * @typedef {Object} TypeSchema
 * @property {function(any): any} coerce
 * @property {function(any): boolean} validate
 */

/** @type {Object.<string, TypeSchema>} */
const TypeSchemas = {
  STR: {
    coerce: v => (typeof v === 'string' ? v : null),
    validate: v => typeof v === 'string' && v.length > 0 && v !== 'null' && v !== 'undefined'
  },
  NUM: {
    coerce: v => (v !== '' ? Number(v) : NaN),
    validate: v => typeof v === 'number' && !isNaN(v)
  },
  BOOL: {
    coerce: v => {
      if (typeof v === 'boolean') return v;
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
      return null;
    },
    validate: v => typeof v === 'boolean'
  }
};

/**
 * @typedef {Object} ConfigEntry
 * @property {any} value - The resolved configuration value
 * @property {string} source - The source name (ENV, IN_CODE, AGENT, DEFAULT)
 */

/**
 * Central configuration state store
 * @type {Object.<string, ConfigEntry>}
 */
const configStore = {};

/**
 * Resolves a configuration value during initial normalization
 * Follows the priority order: ENV > IN_CODE > DEFAULT
 *
 * @param {Object} params
 * @param {string} params.key - Configuration key name
 * @param {string} params.envKey - Environment variable name
 * @param {any} params.inCodeValue - User-provided in-code value
 * @param {any} params.defaultValue - Default fallback value
 * @param {'STR'|'NUM'|'BOOL'} [params.type='STR'] - Value type
 * @returns {any} The resolved configuration value
 */
exports.get = function get({ key, envKey, inCodeValue, defaultValue, type = 'STR' }) {
  const schema = TypeSchemas[type];
  if (!schema) {
    logger.warn(`Unknown type "${type}" for config key "${key}". Defaulting to STR.`);
    return defaultValue;
  }

  // Resolution order: ENV > IN_CODE > DEFAULT
  const sources = [
    { name: SOURCE.ENV, value: process.env[envKey] },
    { name: SOURCE.IN_CODE, value: inCodeValue },
    { name: SOURCE.DEFAULT, value: defaultValue }
  ];

  // eslint-disable-next-line no-restricted-syntax
  for (const source of sources) {
    if (source.value === undefined || source.value === null) {
      continue;
    }

    const coerced = schema.coerce(source.value);
    if (schema.validate(coerced)) {
      configStore[key] = {
        value: coerced,
        source: source.name
      };

      logger.debug(
        `[config] Resolved "${key}" from ${source.name}: ${JSON.stringify(coerced)} (priority: ${
          SOURCE_PRIORITY[source.name]
        })`
      );

      return coerced;
    }

    logger.warn(`[config] Invalid ${type} value for "${key}" from ${source.name}: ${JSON.stringify(source.value)}`);
  }

  logger.warn(`[config] No valid value found for "${key}", using default: ${JSON.stringify(defaultValue)}`);

  configStore[key] = {
    value: defaultValue,
    source: SOURCE.DEFAULT
  };

  return defaultValue;
};

/**
 * Updates a configuration value dynamically (e.g., from agent)
 * Respects the precedence hierarchy
 *
 * @param {Object} params
 * @param {string} params.key
 * @param {any} params.newValue
 * @param {string} params.sourceName
 * @returns {any}
 */
exports.update = function update({ key, newValue, sourceName }) {
  if (newValue === null || newValue === undefined || newValue === '') {
    const current = configStore[key];
    return current ? current.value : null;
  }

  const current = configStore[key];
  const incomingPriority = SOURCE_PRIORITY[sourceName];

  if (incomingPriority === undefined) {
    logger.warn(`[config] Invalid source name "${sourceName}" for key "${key}". Update rejected.`);
    return current?.value || null;
  }

  if (current) {
    const currentPriority = SOURCE_PRIORITY[current.source];
    if (incomingPriority <= currentPriority) {
      logger.info(
        `[config] Rejected "${key}" update from ${sourceName} (priority: ${incomingPriority}): ` +
          `${current.source} (priority: ${currentPriority}) has higher or equal precedence`
      );
      return current.value;
    }
  }

  configStore[key] = {
    value: newValue,
    source: sourceName
  };

  logger.info(`[config] Updated "${key}" from ${sourceName}: ${JSON.stringify(newValue)}`);
  return newValue;
};

/**
 * @param {string} key
 * @returns {ConfigEntry|null}
 */
exports.getConfigEntry = function getConfigEntry(key) {
  return configStore[key] || null;
};

exports.clearConfigStore = function clearConfigStore() {
  Object.keys(configStore).forEach(key => {
    delete configStore[key];
  });
};
