/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/** @type {Set<string>} */
const allowedSecretMatchers = new Set([
  'equals',
  'equals-ignore-case',
  'contains',
  'contains-ignore-case',
  'regex',
  'none'
]);

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @typedef {'contains' | 'equals-ignore-case' | 'equals' | 'contains-ignore-case' | 'regex' | 'none'} MatchingOption
 */

/**
 * @typedef {Object} InstanaSecretsOption
 * @property {MatchingOption} [matcherMode]
 * @property {Array<string>} [keywords]
 */

/**
 * @param {import('../../config').InstanaConfig} _config
 */
exports.init = function init(_config) {
  logger = _config.logger;
};

/**
 * @param {InstanaSecretsOption} config
 * @param {InstanaSecretsOption} defaults
 * @returns {InstanaSecretsOption}
 */
exports.normalize = function normalize(config, defaults) {
  if (config == null) {
    config = {};
  }

  /** @type {InstanaSecretsOption} */
  let fromEnvVar = {};
  if (process.env.INSTANA_SECRETS) {
    fromEnvVar = parseSecretsEnvVar(process.env.INSTANA_SECRETS);
  }

  // Resolve with precedence: config → env → default
  // Todo: change to env → config → default: swap the order of checks in resolveMatcherMode function
  config.matcherMode = resolveMatcherMode({
    configValue: config.matcherMode,
    envValue: fromEnvVar.matcherMode,
    defaultValue: defaults.matcherMode
  });

  config.keywords = resolveKeywords({
    configValue: config.keywords,
    envValue: fromEnvVar.keywords,
    defaultValue: defaults.keywords
  });

  // Special case: 'none' matcher mode should have no keywords
  if (config.matcherMode === 'none') {
    config.keywords = [];
  }

  return config;
};

/**
 * @param {Object} params
 * @param {string|undefined|null} params.configValue
 * @param {string|undefined|null} params.envValue
 * @param {string} params.defaultValue
 * @returns {MatchingOption}
 */
function resolveMatcherMode({ configValue, envValue, defaultValue }) {
  // Validate config value first
  if (configValue !== undefined) {
    if (isString(configValue) && allowedSecretMatchers.has(configValue)) {
      return /** @type {MatchingOption} */ (configValue);
    }

    if (!isString(configValue)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `The value of config.secrets.matcherMode ("${configValue}") is not a string.`
      );
    } else {
      logger.warn(
        // eslint-disable-next-line max-len
        `The value of config.secrets.matcherMode ("${configValue}") is not a supported matcher mode.`
      );
    }
  }

  // check env value
  if (envValue !== undefined) {
    if (isString(envValue) && allowedSecretMatchers.has(envValue)) {
      return /** @type {MatchingOption} */ (envValue);
    }
    if (!isString(envValue)) {
      logger.warn(
        // eslint-disable-next-line max-len
        `The value from INSTANA_SECRETS matcherMode ("${envValue}") is not a string.`
      );
    } else {
      logger.warn(
        // eslint-disable-next-line max-len
        `The value from INSTANA_SECRETS matcherMode ("${envValue}") is not a supported matcher mode.`
      );
    }
  }

  return /** @type {MatchingOption} */ (defaultValue);
}

/**
 * @param {Object} params
 * @param {Array<string>|undefined|null} params.configValue
 * @param {Array<string>|undefined|null} params.envValue
 * @param {Array<string>} params.defaultValue
 * @returns {Array<string>}
 */
function resolveKeywords({ configValue, envValue, defaultValue }) {
  if (configValue !== undefined) {
    if (Array.isArray(configValue)) {
      return configValue;
    }
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.keywords (${configValue}) is not an array.`
    );
  }

  // check env value
  if (envValue !== undefined) {
    if (Array.isArray(envValue)) {
      return envValue;
    }
    logger.warn(
      // eslint-disable-next-line max-len
      `The value from INSTANA_SECRETS keywords (${envValue}) is not an array.`
    );
  }

  return defaultValue;
}

/**
 * @param {string} matcherMode
 * @returns {MatchingOption}
 */
function parseMatcherMode(matcherMode) {
  if (!isString(matcherMode)) {
    return /** @type {MatchingOption} */ ('contains-ignore-case');
  }

  const trimmed = matcherMode.trim().toLowerCase();
  const isSecretMatcher = allowedSecretMatchers.has(trimmed);

  if (isSecretMatcher) {
    return /** @type {MatchingOption} */ (trimmed);
  } else {
    return /** @type {MatchingOption} */ ('contains-ignore-case');
  }
}

/**
 * @param {string} envVarValue
 * @returns {InstanaSecretsOption}
 */
function parseSecretsEnvVar(envVarValue) {
  const [matcherMode, keywords] = envVarValue.split(':', 2);
  const parsedMatcherMode = parseMatcherMode(matcherMode);

  if (parsedMatcherMode === 'none') {
    return {
      matcherMode: parsedMatcherMode,
      keywords: []
    };
  }

  if (!keywords) {
    // a list of keywords (with at least one element) is mandatory for all matcher modes except "none"
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of INSTANA_SECRETS (${envVarValue}) cannot be parsed. Please use the following format: INSTANA_SECRETS=<matcher>:<secret>[,<secret>]. This setting will be ignored.`
    );
    return {};
  }

  const keywordsArray = keywords.split(',').map(word => word.trim());
  return {
    matcherMode: parsedMatcherMode,
    keywords: keywordsArray
  };
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isString(value) {
  return typeof value === 'string';
}
