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
function resolveNumericConfig({ envVar, configValue, defaultValue, configPath }) {
  const envRaw = process.env[envVar];

  /** @param {number|string|null|undefined} val */
  const toValidNumber = val => {
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isNaN(num) ? undefined : num;
  };

  if (envRaw != null) {
    const envParsed = toValidNumber(envRaw);
    if (envParsed !== undefined) {
      return envParsed;
    }

    logger.warn(`Invalid numeric value from env:${envVar}: "${envRaw}". Ignoring and checking config value.`);
  }

  if (configValue != null) {
    const configParsed = toValidNumber(configValue);
    if (configParsed !== undefined) {
      return configParsed;
    }

    logger.warn(
      `Invalid numeric value for ${configPath} from config: "${configValue}". Falling back to default: ${defaultValue}.`
    );
  }

  return defaultValue;
}

exports.resolveNumericConfig = resolveNumericConfig;
