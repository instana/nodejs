/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { CONFIG_SOURCES, CONFIG_PRIORITY } = require('../util/constants');

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
 * @param {any} resolvedConfigValue
 * @param {number} source
 * @param {string} configPath
 */
function wrap(resolvedConfigValue, source, configPath) {
  return {
    resolvedConfigValue,
    source,
    configPath
  };
}

/**
 * Generic resolver (core logic)
 * @param {Record<string, () => any>} sources
 */
function resolveWithPriority(sources) {
  let resolved;

  CONFIG_PRIORITY.find(key => {
    const value = sources[key]();
    if (value !== undefined) {
      resolved = value;
      return true;
    }
    return false;
  });

  return resolved;
}

/**
 * @param {Object} params
 * @param {string} params.envVar
 * @param {number|string|undefined|null} params.configValue
 * @param {number} params.defaultValue
 * @param {string} params.configPath
 * @returns {{ resolvedConfigValue: number, source: number, configPath: string }}
 */
exports.resolveNumericConfig = function resolveNumericConfig({ envVar, configValue, defaultValue, configPath }) {
  /** @param {number|string|null|undefined} val */
  const toValidNumber = val => {
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isNaN(num) ? undefined : num;
  };

  return resolveWithPriority({
    env: () => {
      const envRaw = process.env[envVar];
      if (envRaw != null) {
        const parsed = toValidNumber(envRaw);
        if (parsed !== undefined) {
          logger.debug(`[config] env:${envVar} = ${parsed}`);
          return wrap(parsed, CONFIG_SOURCES.ENV, configPath);
        }
        logger.warn(`Invalid numeric value from env:${envVar}: "${envRaw}".`);
      }
    },

    inCode: () => {
      if (configValue != null) {
        const parsed = toValidNumber(configValue);
        if (parsed !== undefined) {
          logger.debug(`[config] incode:${configPath} = ${parsed}`);
          return wrap(parsed, CONFIG_SOURCES.IN_CODE, configPath);
        }
        logger.warn(
          `Invalid numeric value for ${configPath}: "${configValue}". Falling back to default: ${defaultValue}.`
        );
      }
    },

    default: () => wrap(defaultValue, CONFIG_SOURCES.DEFAULT, configPath)
  });
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
 * @returns {{ resolvedConfigValue: boolean, source: number, configPath: string }}
 */
exports.resolveBooleanConfig = function resolveBooleanConfig({ envVar, configValue, defaultValue, configPath }) {
  return resolveWithPriority({
    env: () => {
      const raw = process.env[envVar];
      const parsed = parseBooleanFromEnv(raw);

      if (parsed !== undefined) {
        logger.debug(`[config] env:${envVar} = ${parsed}`);
        return wrap(parsed, CONFIG_SOURCES.ENV, configPath);
      }

      if (raw != null) {
        logger.warn(`Invalid boolean value for ${envVar}: "${raw}".`);
      }
    },

    inCode: () => {
      if (typeof configValue === 'boolean') {
        logger.debug(`[config] incode:${configPath} = ${configValue}`);
        return wrap(configValue, CONFIG_SOURCES.IN_CODE, configPath);
      }

      if (configValue != null) {
        logger.warn(
          `Invalid configuration: ${configPath} is not boolean: ${JSON.stringify(
            configValue
          )}. Falling back to default: ${defaultValue}.`
        );
      }
    },

    default: () => wrap(defaultValue, CONFIG_SOURCES.DEFAULT, configPath)
  });
};

/**
 * special cases:
 * eg: "INSTANA_DISABLE_USE_OPENTELEMETRY" where env var presence means false in the config "useOpentelemetry".
 *
 * @param {Object} params
 * @param {string} params.envVar
 * @param {boolean|undefined|null} params.configValue
 * @param {boolean} params.defaultValue
 * @param {string} params.configPath
 * @returns {{ resolvedConfigValue: boolean, source: number, configPath: string }}
 */
exports.resolveBooleanConfigWithInvertedEnv = function ({ envVar, configValue, defaultValue, configPath }) {
  return resolveWithPriority({
    env: () => {
      const raw = process.env[envVar];
      const parsed = parseBooleanFromEnv(raw);

      if (parsed !== undefined) {
        const inverted = !parsed;
        logger.debug(`[config] env:${envVar} = ${parsed} (inverted to ${inverted})`);
        return wrap(inverted, CONFIG_SOURCES.ENV, configPath);
      }

      if (raw != null) {
        logger.warn(`Invalid boolean value for ${envVar}: "${raw}".`);
      }
    },

    inCode: () => {
      if (typeof configValue === 'boolean') {
        logger.debug(`[config] incode:${configPath} = ${configValue}`);
        return wrap(configValue, CONFIG_SOURCES.IN_CODE, configPath);
      }
    },

    default: () => wrap(defaultValue, CONFIG_SOURCES.DEFAULT, configPath)
  });
};

/**
 * Returns true if env var exists and is truthy, otherwise uses config or default.
 * eg: "INSTANA_DISABLE_W3C_TRACE_CORRELATION" where env var presence means true in the config .
 *
 * @param {Object} params
 * @param {string} params.envVar
 * @param {boolean|undefined|null} params.configValue
 * @param {boolean} params.defaultValue
 * @param {string} params.configPath
 * @returns {{ resolvedConfigValue: boolean, source: number, configPath: string }}
 */
exports.resolveBooleanConfigWithTruthyEnv = function ({ envVar, configValue, defaultValue, configPath }) {
  return resolveWithPriority({
    env: () => {
      const raw = process.env[envVar];
      if (raw) {
        logger.debug(`[config] env:${envVar} = ${raw}`);
        return wrap(true, CONFIG_SOURCES.ENV, configPath);
      }
    },

    inCode: () => {
      if (typeof configValue === 'boolean') {
        logger.debug(`[config] incode:${configPath} = ${configValue}`);
        return wrap(configValue, CONFIG_SOURCES.IN_CODE, configPath);
      }
    },

    default: () => wrap(defaultValue, CONFIG_SOURCES.DEFAULT, configPath)
  });
};

/**
 * @param {Object} params
 * @param {string} params.envVar
 * @param {string|undefined|null} params.configValue
 * @param {string} params.defaultValue
 * @param {string} params.configPath
 * @returns {{ resolvedConfigValue: string, source: number, configPath: string }}
 */
exports.resolveStringConfig = function resolveStringConfig({ envVar, configValue, defaultValue, configPath }) {
  return resolveWithPriority({
    env: () => {
      const val = process.env[envVar];
      if (val != null) {
        logger.debug(`[config] env:${envVar} = ${val}`);
        return wrap(val, CONFIG_SOURCES.ENV, configPath);
      }
    },

    inCode: () => {
      if (configValue != null) {
        if (typeof configValue !== 'string') {
          logger.warn(
            `Invalid configuration: ${configPath} is not a string: ${JSON.stringify(
              configValue
            )}. Falling back to default: ${defaultValue}.`
          );
          return;
        }

        logger.debug(`[config] incode:${configPath} = ${configValue}`);
        return wrap(configValue, CONFIG_SOURCES.IN_CODE, configPath);
      }
    },

    default: () => wrap(defaultValue, CONFIG_SOURCES.DEFAULT, configPath)
  });
};
