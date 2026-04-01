/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const configNormalizers = require('./configNormalizers');
const configValidators = require('./configValidators');
const deepMerge = require('../util/deepMerge');
const { DEFAULT_STACK_TRACE_LENGTH, DEFAULT_STACK_TRACE_MODE } = require('../util/constants');
const { validateStackTraceMode, validateStackTraceLength } = require('./configValidators/stackTraceValidation');
const util = require('./util');

/**
 * @typedef {Object} InstanaTracingOption
 * @property {boolean} [enabled]
 * @property {boolean} [useOpentelemetry]
 * @property {boolean} [automaticTracingEnabled]
 * @property {boolean} [activateImmediately]
 * @property {number} [forceTransmissionStartingAt]
 * @property {number} [initialTransmissionDelay]
 * @property {number} [maxBufferedSpans]
 * @property {number} [transmissionDelay]
 * @property {string} [stackTrace]
 * @property {number} [stackTraceLength]
 * @property {HTTPTracingOptions} [http]
 * @property {import('../config/types').Disable} [disable]
 * @property {boolean} [spanBatchingEnabled]
 * @property {boolean} [disableW3cTraceCorrelation]
 * @property {KafkaTracingOptions} [kafka]
 * @property {boolean} [allowRootExitSpan]
 * @property {import('../config/types').IgnoreEndpoints} [ignoreEndpoints]
 * @property {boolean} [ignoreEndpointsDisableSuppression]
 * @property {boolean} [disableEOLEvents]
 * @property {globalStackTraceConfig} [global]
 */

/**
 * @typedef {Object} HTTPTracingOptions
 * @property {Array<string>} [extraHttpHeadersToCapture]
 */

/**
 * @typedef {Object} KafkaTracingOptions
 * @property {boolean} [traceCorrelation]
 */

/**
 * @typedef {Object} globalStackTraceConfig
 * @property {string} [stackTrace]
 * @property {number} [stackTraceLength]
 */

/**
 * @typedef {Object} InstanaMetricsOption
 * @property {number} [transmissionDelay]
 * @property {number} [timeBetweenHealthcheckCalls]
 */

/**
 * @typedef {'contains' | 'equals-ignore-case' | 'equals' | 'contains-ignore-case' | 'regex' | 'none'} MatchingOption
 */

/**
 * @typedef {Object} InstanaSecretsOption
 * @property {MatchingOption} [matcherMode]
 * @property {Array<string>} [keywords]
 */

/** @type {String[]} */
const allowedSecretMatchers = ['equals', 'equals-ignore-case', 'contains', 'contains-ignore-case', 'regex', 'none'];

/**
 * @typedef {Object} InstanaConfig
 * @property {string} [serviceName]
 * @property {import('../core').GenericLogger} [logger]
 * @property {string} [packageJsonPath]
 * @property {InstanaMetricsOption} [metrics]
 * @property {InstanaTracingOption} [tracing]
 * @property {InstanaSecretsOption} [secrets]
 * @property {number} [timeBetweenHealthcheckCalls]
 * @property {boolean} [preloadOpentelemetry]
 */

/** @type {import('../core').GenericLogger} */
let logger;

/** @type {InstanaConfig} */
let defaults = {
  serviceName: null,
  packageJsonPath: null,

  metrics: {
    transmissionDelay: 1000,
    timeBetweenHealthcheckCalls: 3000
  },

  tracing: {
    enabled: true,
    useOpentelemetry: true,
    allowRootExitSpan: false,
    automaticTracingEnabled: true,
    activateImmediately: false,
    forceTransmissionStartingAt: 500,
    maxBufferedSpans: 1000,
    transmissionDelay: 1000,
    initialTransmissionDelay: 1000,
    http: {
      extraHttpHeadersToCapture: []
    },
    stackTrace: DEFAULT_STACK_TRACE_MODE,
    stackTraceLength: DEFAULT_STACK_TRACE_LENGTH,
    disable: {},
    spanBatchingEnabled: false,
    disableW3cTraceCorrelation: false,
    kafka: {
      traceCorrelation: true
    },
    ignoreEndpoints: {},
    ignoreEndpointsDisableSuppression: false,
    disableEOLEvents: false
  },
  preloadOpentelemetry: false,
  secrets: {
    matcherMode: 'contains-ignore-case',
    keywords: ['key', 'pass', 'secret']
  }
};

const validSecretsMatcherModes = ['equals-ignore-case', 'equals', 'contains-ignore-case', 'contains', 'regex', 'none'];

module.exports.configNormalizers = configNormalizers;
module.exports.configValidators = configValidators;

/**
 * @param {import('../core').GenericLogger} [_logger]
 */
module.exports.init = _logger => {
  logger = _logger;
  configNormalizers.init({ logger });
  util.init(logger);
};

/**
 * Merges the config that was passed to the init function with environment variables and default values.
 */

/**
 * @param {InstanaConfig} [userConfig]
 * @param {InstanaConfig} [defaultsOverride]
 * @returns {InstanaConfig}
 */
module.exports.normalize = (userConfig, defaultsOverride = {}) => {
  if (defaultsOverride && typeof defaultsOverride === 'object') {
    defaults = deepMerge(defaults, defaultsOverride);
  }

  let normalizedUserConfig;
  if (userConfig !== null) {
    normalizedUserConfig = Object.assign({}, userConfig);
  }
  /** @type InstanaConfig */
  const config = {};

  // TODO: remove this and forward the logger via init fn.
  config.logger = logger;

  // Each normalize function receives userConfig (read-only) and config (write target)
  normalizeServiceName(userConfig, config);
  normalizePackageJsonPath(userConfig, config);
  normalizeMetricsConfig(userConfig, config);
  normalizeTracingConfig(userConfig, config);
  normalizeSecrets(userConfig, config);
  normalizePreloadOpentelemetry(userConfig, config);

  return config;
};

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizeServiceName(userConfig, config) {
  const userValue = userConfig?.serviceName;

  if (userValue != null) {
    if (typeof userValue === 'string') {
      config.serviceName = userValue;
    } else {
      logger.warn(`Invalid configuration: config.serviceName is not a string, the value will be ignored: ${userValue}`);
      config.serviceName = defaults.serviceName;
    }
  } else if (process.env.INSTANA_SERVICE_NAME) {
    config.serviceName = process.env.INSTANA_SERVICE_NAME;
    logger.debug(`[config] env:INSTANA_SERVICE_NAME = ${process.env.INSTANA_SERVICE_NAME}`);
  } else if (config.serviceName != null && typeof config.serviceName === 'string') {
    logger.debug(`[config] incode:config.serviceName = ${config.serviceName}`);
  }
  if (config.serviceName != null && typeof config.serviceName !== 'string') {
    logger.warn(
      `Invalid configuration: config.serviceName is not a string, the value will be ignored: ${config.serviceName}`
    );
    config.serviceName = defaults.serviceName;
  }
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizePackageJsonPath(userConfig, config) {
  const userValue = userConfig?.packageJsonPath;

  if (userValue != null) {
    if (typeof userValue === 'string') {
      config.packageJsonPath = userValue;
    } else {
      logger.warn(
        // eslint-disable-next-line max-len
        `Invalid configuration: config.packageJsonPath is not a string, the value will be ignored: ${userValue}`
      );
      config.packageJsonPath = null;
    }
  } else if (process.env.INSTANA_PACKAGE_JSON_PATH) {
    config.packageJsonPath = process.env.INSTANA_PACKAGE_JSON_PATH;
    logger.debug(`[config] env:INSTANA_PACKAGE_JSON_PATH = ${process.env.INSTANA_PACKAGE_JSON_PATH}`);
  } else if (config.packageJsonPath != null && typeof config.packageJsonPath === 'string') {
    logger.debug(`[config] incode:config.packageJsonPath = ${config.packageJsonPath}`);
  }
  if (config.packageJsonPath != null && typeof config.packageJsonPath !== 'string') {
    logger.warn(
      // eslint-disable-next-line max-len
      `Invalid configuration: config.packageJsonPath is not a string, the value will be ignored: ${config.packageJsonPath}`
    );
    config.packageJsonPath = null;
  }
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizeMetricsConfig(userConfig, config) {
  const userMetrics = userConfig?.metrics;

  config.metrics = {};

  config.metrics.transmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_METRICS_TRANSMISSION_DELAY',
    configValue: userMetrics?.transmissionDelay,
    defaultValue: defaults.metrics.transmissionDelay,
    configPath: 'config.metrics.transmissionDelay'
  });

  config.metrics.timeBetweenHealthcheckCalls =
    userMetrics?.timeBetweenHealthcheckCalls || defaults.metrics.timeBetweenHealthcheckCalls;
}

/**

 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizeTracingConfig(userConfig, config) {
  const userTracingConfig = userConfig?.tracing;

  config.tracing = {};

  normalizeTracingEnabled(userTracingConfig, config);
  normalizeUseOpentelemetry(userTracingConfig, config);
  normalizeDisableTracing(userConfig, config);
  normalizeAutomaticTracingEnabled(userTracingConfig, config);
  normalizeActivateImmediately(userTracingConfig, config);
  normalizeTracingTransmission(userTracingConfig, config);
  normalizeTracingHttp(userTracingConfig, config);
  normalizeTracingStackTrace(userConfig, config);
  normalizeSpanBatchingEnabled(userTracingConfig, config);
  normalizeDisableW3cTraceCorrelation(userTracingConfig, config);
  normalizeTracingKafka(userTracingConfig, config);
  normalizeAllowRootExitSpan(userTracingConfig, config);
  normalizeIgnoreEndpoints(userTracingConfig, config);
  normalizeIgnoreEndpointsDisableSuppression(userTracingConfig, config);
  normalizeDisableEOLEvents(userTracingConfig, config);
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeTracingEnabled(userTracingConfig, config) {
  config.tracing.enabled = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_TRACING_DISABLE',
    configValue: userTracingConfig?.enabled,
    defaultValue: defaults.tracing.enabled,
    configPath: 'config.tracing.enabled'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeAllowRootExitSpan(userTracingConfig, config) {
  config.tracing.allowRootExitSpan = util.resolveBooleanConfig({
    envVar: 'INSTANA_ALLOW_ROOT_EXIT_SPAN',
    configValue: userTracingConfig?.allowRootExitSpan,
    defaultValue: defaults.tracing.allowRootExitSpan,
    configPath: 'config.tracing.allowRootExitSpan'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeUseOpentelemetry(userTracingConfig, config) {
  config.tracing.useOpentelemetry = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_DISABLE_USE_OPENTELEMETRY',
    configValue: userTracingConfig?.useOpentelemetry,
    defaultValue: defaults.tracing.useOpentelemetry,
    configPath: 'config.tracing.useOpentelemetry'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeAutomaticTracingEnabled(userTracingConfig, config) {
  if (!config.tracing.enabled) {
    logger.debug('Not enabling automatic tracing as tracing in general is explicitly disabled via config.');
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  config.tracing.automaticTracingEnabled = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_DISABLE_AUTO_INSTR',
    configValue: userTracingConfig?.automaticTracingEnabled,
    defaultValue: defaults.tracing.automaticTracingEnabled,
    configPath: 'config.tracing.automaticTracingEnabled'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeActivateImmediately(userTracingConfig, config) {
  if (!config.tracing.enabled) {
    config.tracing.activateImmediately = false;
    return;
  }

  config.tracing.activateImmediately = util.resolveBooleanConfig({
    envVar: 'INSTANA_TRACE_IMMEDIATELY',
    configValue: userTracingConfig?.activateImmediately,
    defaultValue: defaults.tracing.activateImmediately,
    configPath: 'config.tracing.activateImmediately'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeTracingTransmission(userTracingConfig, config) {
  config.tracing.maxBufferedSpans = userTracingConfig?.maxBufferedSpans || defaults.tracing.maxBufferedSpans;

  config.tracing.transmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_TRACING_TRANSMISSION_DELAY',
    configValue: userTracingConfig?.transmissionDelay,
    defaultValue: defaults.tracing.transmissionDelay,
    configPath: 'config.tracing.transmissionDelay'
  });

  config.tracing.forceTransmissionStartingAt = util.resolveNumericConfig({
    envVar: 'INSTANA_FORCE_TRANSMISSION_STARTING_AT',
    configValue: userTracingConfig?.forceTransmissionStartingAt,
    defaultValue: defaults.tracing.forceTransmissionStartingAt,
    configPath: 'config.tracing.forceTransmissionStartingAt'
  });

  config.tracing.initialTransmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_TRACING_INITIAL_TRANSMISSION_DELAY',
    configValue: userTracingConfig?.initialTransmissionDelay,
    defaultValue: defaults.tracing.initialTransmissionDelay,
    configPath: 'config.tracing.initialTransmissionDelay'
  });
}

/**
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeTracingHttp(userTracingConfig, config) {
  const userHttp = userTracingConfig?.http;
  config.tracing.http = {};

  let fromEnvVar;
  if (process.env.INSTANA_EXTRA_HTTP_HEADERS) {
    fromEnvVar = parseHeadersEnvVar(process.env.INSTANA_EXTRA_HTTP_HEADERS);
  }

  const userHeaders = userHttp?.extraHttpHeadersToCapture;

  if (!userHeaders && !fromEnvVar) {
    config.tracing.http.extraHttpHeadersToCapture = defaults.tracing.http.extraHttpHeadersToCapture;
    return;
  } else if (!userHeaders && fromEnvVar) {
    config.tracing.http.extraHttpHeadersToCapture = fromEnvVar;
    logger.debug(`[config] env:INSTANA_EXTRA_HTTP_HEADERS = ${process.env.INSTANA_EXTRA_HTTP_HEADERS}`);
  } else if (config.tracing.http.extraHttpHeadersToCapture) {
    logger.debug('[config] incode:config.tracing.http.extraHttpHeadersToCapture');
  }

  if (!Array.isArray(userHeaders)) {
    logger.warn(
      // eslint-disable-next-line max-len
      `Invalid configuration: config.tracing.http.extraHttpHeadersToCapture is not an array, the value will be ignored: ${JSON.stringify(
        userHeaders
      )}`
    );
    config.tracing.http.extraHttpHeadersToCapture = defaults.tracing.http.extraHttpHeadersToCapture;
    return;
  }

  config.tracing.http.extraHttpHeadersToCapture = userHeaders.map(s => s.toLowerCase());
}

/**
 * @param {string} envVarValue
 * @returns {Array<string>}
 */
function parseHeadersEnvVar(envVarValue) {
  return envVarValue
    .split(/[;,]/)
    .map(header => header.trim().toLowerCase())
    .filter(header => header !== '');
}

/**
 * Handles both stackTrace and stackTraceLength configuration
 *
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 *
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizeTracingStackTrace(userConfig, config) {
  const userTracingConfig = userConfig?.tracing;
  const userGlobal = userTracingConfig?.global;

  const envStackTrace = process.env.INSTANA_STACK_TRACE;
  const envStackTraceLength = process.env.INSTANA_STACK_TRACE_LENGTH;

  if (envStackTrace !== undefined) {
    const result = validateStackTraceMode(envStackTrace);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceModeFromEnv(envStackTrace);
      if (normalized !== null) {
        config.tracing.stackTrace = normalized;
      } else {
        config.tracing.stackTrace = defaults.tracing.stackTrace;
      }
    } else {
      logger.warn(`Invalid env INSTANA_STACK_TRACE: ${result.error}`);
      config.tracing.stackTrace = defaults.tracing.stackTrace;
    }
  } else if (userGlobal?.stackTrace !== undefined) {
    const result = validateStackTraceMode(userGlobal.stackTrace);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceMode(userConfig);
      if (normalized !== null) {
        config.tracing.stackTrace = normalized;
      } else {
        config.tracing.stackTrace = defaults.tracing.stackTrace;
      }
    } else {
      logger.warn(`Invalid config.tracing.global.stackTrace: ${result.error}`);
      config.tracing.stackTrace = defaults.tracing.stackTrace;
    }
  } else {
    config.tracing.stackTrace = defaults.tracing.stackTrace;
  }

  const isLegacyLengthDefined = userTracingConfig?.stackTraceLength !== undefined;
  const stackTraceConfigValue = userGlobal?.stackTraceLength || userTracingConfig?.stackTraceLength;

  if (envStackTraceLength !== undefined) {
    const result = validateStackTraceLength(envStackTraceLength);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceLengthFromEnv(envStackTraceLength);
      if (normalized !== null) {
        config.tracing.stackTraceLength = normalized;
      } else {
        config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
      }
    } else {
      logger.warn(`Invalid env INSTANA_STACK_TRACE_LENGTH: ${result.error}`);
      config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
    }
  } else if (stackTraceConfigValue !== undefined) {
    if (isLegacyLengthDefined) {
      logger.warn(
        // eslint-disable-next-line max-len
        '[Deprecation Warning] The configuration option config.tracing.stackTraceLength is deprecated and will be removed in a future release. ' +
          'Please use config.tracing.global.stackTraceLength instead.'
      );
    }

    const result = validateStackTraceLength(stackTraceConfigValue);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceLength(userConfig);
      if (normalized !== null) {
        config.tracing.stackTraceLength = normalized;
      } else {
        config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
      }
    } else {
      logger.warn(`Invalid stackTraceLength value: ${result.error}`);
      config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
    }
  } else {
    config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
  }
}

/**
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizeDisableTracing(userConfig, config) {
  const tempConfig = {
    tracing: userConfig?.tracing ? { ...userConfig.tracing } : {}
  };

  const disableConfig = configNormalizers.disable.normalize(tempConfig);

  // If tracing is globally disabled (via `disable: true` or INSTANA_TRACING_DISABLE=true ),
  // mark `tracing.enabled` as false and clear any specific disable rules.
  if (disableConfig === true) {
    config.tracing.enabled = false;
    config.tracing.disable = {};
    return;
  }

  if (typeof disableConfig === 'object' && (disableConfig.instrumentations?.length || disableConfig.groups?.length)) {
    config.tracing.disable = disableConfig;
    return;
  }
  config.tracing.disable = defaults.tracing.disable;
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeSpanBatchingEnabled(userTracingConfig, config) {
  config.tracing.spanBatchingEnabled = util.resolveBooleanConfig({
    envVar: 'INSTANA_SPANBATCHING_ENABLED',
    configValue: userTracingConfig?.spanBatchingEnabled,
    defaultValue: defaults.tracing.spanBatchingEnabled,
    configPath: 'config.tracing.spanBatchingEnabled'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeDisableW3cTraceCorrelation(userTracingConfig, config) {
  config.tracing.disableW3cTraceCorrelation = util.resolveBooleanConfigWithTruthyEnv({
    envVar: 'INSTANA_DISABLE_W3C_TRACE_CORRELATION',
    configValue: config.tracing.disableW3cTraceCorrelation,
    defaultValue: defaults.tracing.disableW3cTraceCorrelation,
    configPath: 'config.tracing.disableW3cTraceCorrelation'
  });
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeTracingKafka(userTracingConfig, config) {
  const userKafka = userTracingConfig?.kafka;
  config.tracing.kafka = {};

  config.tracing.kafka.traceCorrelation = util.resolveBooleanConfig({
    envVar: 'INSTANA_KAFKA_TRACE_CORRELATION',
    configValue: userKafka?.traceCorrelation,
    defaultValue: defaults.tracing.kafka.traceCorrelation,
    configPath: 'config.tracing.kafka.traceCorrelation'
  });
}

/**
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizeSecrets(userConfig, config) {
  const userSecrets = userConfig?.secrets;
  config.secrets = {};

  /** @type {InstanaSecretsOption} */
  let fromEnvVar = {};
  if (process.env.INSTANA_SECRETS) {
    fromEnvVar = parseSecretsEnvVar(process.env.INSTANA_SECRETS);
  }

  if (config.secrets.matcherMode) {
    logger.debug(`[config] incode:config.secrets.matcherMode = ${config.secrets.matcherMode}`);
  } else if (fromEnvVar.matcherMode) {
    logger.debug(`[config] env:INSTANA_SECRETS (matcherMode) = ${fromEnvVar.matcherMode}`);
  }

  if (config.secrets.keywords) {
    logger.debug('[config] incode:config.secrets.keywords');
  } else if (fromEnvVar.keywords) {
    logger.debug('[config] env:INSTANA_SECRETS (keywords)');
  }

  config.secrets.matcherMode = config.secrets.matcherMode || fromEnvVar.matcherMode || defaults.secrets.matcherMode;
  config.secrets.keywords = config.secrets.keywords || fromEnvVar.keywords || defaults.secrets.keywords;

  const keywords = userSecrets?.keywords || fromEnvVar.keywords || defaults.secrets.keywords;

  if (typeof matcherMode !== 'string') {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.matcherMode ("${matcherMode}") is not a string. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    config.secrets.matcherMode = defaults.secrets.matcherMode;
  } else if (validSecretsMatcherModes.indexOf(matcherMode) < 0) {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.matcherMode (or the matcher mode parsed from INSTANA_SECRETS) (${matcherMode}) is not a supported matcher mode. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    config.secrets.matcherMode = defaults.secrets.matcherMode;
  } else {
    config.secrets.matcherMode = matcherMode;
  }

  if (!Array.isArray(keywords)) {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.keywords (${keywords}) is not an array. Assuming the default value ${defaults.secrets.keywords}.`
    );
    config.secrets.keywords = defaults.secrets.keywords;
  } else {
    config.secrets.keywords = keywords;
  }

  if (config.secrets.matcherMode === 'none') {
    config.secrets.keywords = [];
  }
}

/**
 * @param {string} matcherMode
 * @returns {MatchingOption}
 */
function parseMatcherMode(matcherMode) {
  const trimmed = matcherMode.trim().toLowerCase();
  const isSecretMatcher = allowedSecretMatchers.includes(trimmed);

  if (isSecretMatcher) {
    return /** @type {MatchingOption} */ (trimmed);
  } else {
    return /** @type {MatchingOption} */ 'contains-ignore-case';
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
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeIgnoreEndpoints(userTracingConfig, config) {
  const userIgnoreEndpoints = userTracingConfig?.ignoreEndpoints;

  if (userIgnoreEndpoints && (typeof userIgnoreEndpoints !== 'object' || Array.isArray(userIgnoreEndpoints))) {
    logger.warn(
      `Invalid tracing.ignoreEndpoints configuration. Expected an object, but received: ${JSON.stringify(
        userIgnoreEndpoints
      )}`
    );
    config.tracing.ignoreEndpoints = {};
    return;
  }

  // Case 1: Use in-code configuration if available
  if (Object.keys(ignoreEndpointsConfig).length) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.normalizeConfig(ignoreEndpointsConfig);
    logger.debug('[config] incode:config.tracing.ignoreEndpoints');
    return;
  }

  // Case 2: Load from a YAML file if `INSTANA_IGNORE_ENDPOINTS_PATH` is set
  // Introduced in Phase 2 for advanced filtering based on both methods and endpoints.
  // Also supports basic filtering for endpoints.
  if (process.env.INSTANA_IGNORE_ENDPOINTS_PATH) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromYaml(
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH
    );

    logger.debug('[config] env:INSTANA_IGNORE_ENDPOINTS_PATH');
    return;
  }

  // Case 3: Load from the `INSTANA_IGNORE_ENDPOINTS` environment variable
  // Introduced in Phase 1 for basic filtering based only on operations (e.g., `redis.get`, `kafka.consume`).
  // Provides a simple way to configure ignored operations via environment variables.
  if (process.env.INSTANA_IGNORE_ENDPOINTS) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromEnv(process.env.INSTANA_IGNORE_ENDPOINTS);
    logger.debug('[config] env:INSTANA_IGNORE_ENDPOINTS');
  }

  config.tracing.ignoreEndpoints = {};
}

/**
 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeIgnoreEndpointsDisableSuppression(userTracingConfig, config) {
  config.tracing.ignoreEndpointsDisableSuppression = util.resolveBooleanConfig({
    envVar: 'INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION',
    configValue: userTracingConfig?.ignoreEndpointsDisableSuppression,
    defaultValue: defaults.tracing.ignoreEndpointsDisableSuppression,
    configPath: 'config.tracing.ignoreEndpointsDisableSuppression'
  });
}

/**

 * @param {InstanaTracingOption} userTracingConfig
 * @param {InstanaConfig} config
 */
function normalizeDisableEOLEvents(userTracingConfig, config) {
  config.tracing.disableEOLEvents = util.resolveBooleanConfig({
    envVar: 'INSTANA_TRACING_DISABLE_EOL_EVENTS',
    configValue: userTracingConfig?.disableEOLEvents,
    defaultValue: defaults.tracing.disableEOLEvents,
    configPath: 'config.tracing.disableEOLEvents'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} config
 */
function normalizePreloadOpentelemetry(userConfig, config) {
  if (userConfig?.preloadOpentelemetry === true) {
    config.preloadOpentelemetry = true;
  } else {
    config.preloadOpentelemetry = defaults.preloadOpentelemetry;
  }
}
