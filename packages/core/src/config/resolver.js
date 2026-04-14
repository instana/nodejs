/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { CONFIG_SOURCE } = require('../util/constants');

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * @param {import('../core').GenericLogger} [_logger]
 */
exports.init = _logger => {
  logger = _logger;
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
  [CONFIG_SOURCE.ENV]: 4,
  [CONFIG_SOURCE.IN_CODE]: 3,
  [CONFIG_SOURCE.AGENT]: 2,
  [CONFIG_SOURCE.DEFAULT]: 1
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
 * @typedef {Object} ConfigStore
 * @property {string} source
 */

/**
 * @type {Object.<string, ConfigStore>}
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

  const sources = [
    { name: CONFIG_SOURCE.ENV, value: process.env[envKey] },
    { name: CONFIG_SOURCE.IN_CODE, value: inCodeValue },
    { name: CONFIG_SOURCE.DEFAULT, value: defaultValue }
  ];

  // eslint-disable-next-line no-restricted-syntax
  for (const source of sources) {
    if (source.value === undefined || source.value === null) {
      continue;
    }

    const coerced = schema.coerce(source.value);
    if (schema.validate(coerced)) {
      configStore[key] = {
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
    source: CONFIG_SOURCE.DEFAULT
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
    return undefined;
  }

  const current = configStore[key];
  const incomingPriority = SOURCE_PRIORITY[sourceName];

  if (incomingPriority === undefined) {
    logger.warn(`[config] Invalid source name "${sourceName}" for key "${key}". Update rejected.`);
    return undefined;
  }

  if (current) {
    const currentPriority = SOURCE_PRIORITY[current.source];
    if (incomingPriority <= currentPriority) {
      logger.info(
        `[config] Rejected "${key}" update from ${sourceName} (priority: ${incomingPriority}): ` +
          `${current.source} (priority: ${currentPriority}) has higher or equal precedence`
      );
      return undefined;
    }
  }

  configStore[key] = {
    source: sourceName
  };

  logger.info(`[config] Updated "${key}" from ${sourceName}: ${JSON.stringify(newValue)}`);
  return newValue;
};

/**
 * @param {string} key
 * @returns {ConfigStore|null}
 */
exports.getConfigStore = function getConfigStore(key) {
  return configStore[key] || null;
};

exports.clearConfigStore = function clearConfigStore() {
  Object.keys(configStore).forEach(key => {
    delete configStore[key];
  });
};
