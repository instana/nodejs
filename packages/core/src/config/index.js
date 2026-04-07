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
 * @param {Object} [options]
 * @param {InstanaConfig} [options.userConfig]
 * @param {Object} [options.finalConfigBase]
 * @param {InstanaConfig} [options.defaultsOverride]
 * @returns {InstanaConfig}
 */
module.exports.normalize = ({ userConfig = {}, finalConfigBase = {}, defaultsOverride = {} } = {}) => {
  if (defaultsOverride && typeof defaultsOverride === 'object' && Object.keys(defaultsOverride).length > 0) {
    defaults = deepMerge(defaults, defaultsOverride);
  }

  let normalizedUserConfig;

  // NOTE: Do not modify the original user input object
  if (userConfig !== null && userConfig !== undefined) {
    normalizedUserConfig = Object.assign({}, userConfig);
  } else {
    normalizedUserConfig = {};
  }

  // Preserve finalConfigBase in the finalConfig to allow additional config values
  // that are not part of the core config schema. Eg: collector config needs to be preserved.
  /** @type InstanaConfig */
  const finalConfig = finalConfigBase ? Object.assign({}, finalConfigBase) : {};

  // TODO: remove this and forward the logger via init fn.
  finalConfig.logger = logger;

  normalizeServiceName(normalizedUserConfig, defaults, finalConfig);
  normalizePackageJsonPath(normalizedUserConfig, defaults, finalConfig);
  normalizeMetricsConfig(normalizedUserConfig, defaults, finalConfig);
  normalizeTracingConfig(normalizedUserConfig, defaults, finalConfig);
  normalizeSecrets(normalizedUserConfig, defaults, finalConfig);
  normalizePreloadOpentelemetry(normalizedUserConfig, defaults, finalConfig);

  return finalConfig;
};

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeServiceName(userConfig, defaultConfig, finalConfig) {
  const userValue = userConfig.serviceName;

  if (userValue != null) {
    if (typeof userValue === 'string') {
      finalConfig.serviceName = userValue;
      logger.debug(`[config] incode:config.serviceName = ${finalConfig.serviceName}`);
    } else {
      logger.warn(`Invalid configuration: config.serviceName is not a string, the value will be ignored: ${userValue}`);
      finalConfig.serviceName = defaultConfig.serviceName;
    }
  } else if (process.env.INSTANA_SERVICE_NAME) {
    finalConfig.serviceName = process.env.INSTANA_SERVICE_NAME;
    logger.debug(`[config] env:INSTANA_SERVICE_NAME = ${process.env.INSTANA_SERVICE_NAME}`);
  } else {
    finalConfig.serviceName = defaultConfig.serviceName;
  }
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizePackageJsonPath(userConfig, defaultConfig, finalConfig) {
  const userValue = userConfig.packageJsonPath;

  if (userValue != null) {
    if (typeof userValue === 'string') {
      finalConfig.packageJsonPath = userValue;
      logger.debug(`[config] incode:config.packageJsonPath = ${finalConfig.packageJsonPath}`);
    } else {
      logger.warn(
        `Invalid configuration: config.packageJsonPath is not a string, the value will be ignored: ${userValue}`
      );
      finalConfig.packageJsonPath = defaultConfig.packageJsonPath;
    }
  } else if (process.env.INSTANA_PACKAGE_JSON_PATH) {
    finalConfig.packageJsonPath = process.env.INSTANA_PACKAGE_JSON_PATH;
    logger.debug(`[config] env:INSTANA_PACKAGE_JSON_PATH = ${process.env.INSTANA_PACKAGE_JSON_PATH}`);
  } else {
    finalConfig.packageJsonPath = defaultConfig.packageJsonPath;
  }
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeMetricsConfig(userConfig, defaultConfig, finalConfig) {
  const userMetrics = userConfig.metrics;

  finalConfig.metrics = {};

  finalConfig.metrics.transmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_METRICS_TRANSMISSION_DELAY',
    configValue: userMetrics?.transmissionDelay,
    defaultValue: defaultConfig.metrics.transmissionDelay,
    configPath: 'config.metrics.transmissionDelay'
  });

  finalConfig.metrics.timeBetweenHealthcheckCalls =
    userMetrics?.timeBetweenHealthcheckCalls || defaultConfig.metrics.timeBetweenHealthcheckCalls;
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeTracingConfig(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing = finalConfig.tracing || {};

  userConfig.tracing = userConfig.tracing || {};

  normalizeTracingEnabled(userConfig, defaultConfig, finalConfig);
  normalizeUseOpentelemetry(userConfig, defaultConfig, finalConfig);
  normalizeDisableTracing(userConfig, defaultConfig, finalConfig);
  normalizeAutomaticTracingEnabled(userConfig, defaultConfig, finalConfig);
  normalizeActivateImmediately(userConfig, defaultConfig, finalConfig);
  normalizeTracingTransmission(userConfig, defaultConfig, finalConfig);
  normalizeTracingHttp(userConfig, defaultConfig, finalConfig);
  normalizeTracingStackTrace(userConfig, defaultConfig, finalConfig);
  normalizeSpanBatchingEnabled(userConfig, defaultConfig, finalConfig);
  normalizeDisableW3cTraceCorrelation(userConfig, defaultConfig, finalConfig);
  normalizeTracingKafka(userConfig, defaultConfig, finalConfig);
  normalizeAllowRootExitSpan(userConfig, defaultConfig, finalConfig);
  normalizeIgnoreEndpoints(userConfig, defaultConfig, finalConfig);
  normalizeIgnoreEndpointsDisableSuppression(userConfig, defaultConfig, finalConfig);
  normalizeDisableEOLEvents(userConfig, defaultConfig, finalConfig);
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeTracingEnabled(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.enabled = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_TRACING_DISABLE',
    configValue: userConfig.tracing.enabled,
    defaultValue: defaultConfig.tracing.enabled,
    configPath: 'config.tracing.enabled'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeAllowRootExitSpan(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.allowRootExitSpan = util.resolveBooleanConfig({
    envVar: 'INSTANA_ALLOW_ROOT_EXIT_SPAN',
    configValue: userConfig.tracing.allowRootExitSpan,
    defaultValue: defaultConfig.tracing.allowRootExitSpan,
    configPath: 'config.tracing.allowRootExitSpan'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeUseOpentelemetry(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.useOpentelemetry = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_DISABLE_USE_OPENTELEMETRY',
    configValue: userConfig.tracing.useOpentelemetry,
    defaultValue: defaultConfig.tracing.useOpentelemetry,
    configPath: 'config.tracing.useOpentelemetry'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeAutomaticTracingEnabled(userConfig, defaultConfig, finalConfig) {
  if (!finalConfig.tracing.enabled) {
    logger.info('Not enabling automatic tracing as tracing in general is explicitly disabled via finalConfig.');
    finalConfig.tracing.automaticTracingEnabled = false;
    return;
  }

  finalConfig.tracing.automaticTracingEnabled = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_DISABLE_AUTO_INSTR',
    configValue: userConfig.tracing.automaticTracingEnabled,
    defaultValue: defaultConfig.tracing.automaticTracingEnabled,
    configPath: 'config.tracing.automaticTracingEnabled'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeActivateImmediately(userConfig, defaultConfig, finalConfig) {
  if (!finalConfig.tracing.enabled) {
    finalConfig.tracing.activateImmediately = false;
    return;
  }

  finalConfig.tracing.activateImmediately = util.resolveBooleanConfig({
    envVar: 'INSTANA_TRACE_IMMEDIATELY',
    configValue: userConfig.tracing.activateImmediately,
    defaultValue: defaultConfig.tracing.activateImmediately,
    configPath: 'config.tracing.activateImmediately'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeTracingTransmission(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.maxBufferedSpans = userConfig.tracing.maxBufferedSpans || defaultConfig.tracing.maxBufferedSpans;

  finalConfig.tracing.transmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_TRACING_TRANSMISSION_DELAY',
    configValue: userConfig.tracing.transmissionDelay,
    defaultValue: defaultConfig.tracing.transmissionDelay,
    configPath: 'config.tracing.transmissionDelay'
  });

  finalConfig.tracing.forceTransmissionStartingAt = util.resolveNumericConfig({
    envVar: 'INSTANA_FORCE_TRANSMISSION_STARTING_AT',
    configValue: userConfig.tracing.forceTransmissionStartingAt,
    defaultValue: defaultConfig.tracing.forceTransmissionStartingAt,
    configPath: 'config.tracing.forceTransmissionStartingAt'
  });

  finalConfig.tracing.initialTransmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_TRACING_INITIAL_TRANSMISSION_DELAY',
    configValue: userConfig.tracing.initialTransmissionDelay,
    defaultValue: defaultConfig.tracing.initialTransmissionDelay,
    configPath: 'config.tracing.initialTransmissionDelay'
  });
}

/**
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeTracingHttp(userConfig, defaultConfig, finalConfig) {
  const userHttp = userConfig.tracing.http;
  finalConfig.tracing.http = {};

  let fromEnvVar;
  if (process.env.INSTANA_EXTRA_HTTP_HEADERS) {
    fromEnvVar = parseHeadersEnvVar(process.env.INSTANA_EXTRA_HTTP_HEADERS);
  }

  const userHeaders = userHttp?.extraHttpHeadersToCapture;

  if (!userHeaders && !fromEnvVar) {
    finalConfig.tracing.http.extraHttpHeadersToCapture = defaultConfig.tracing.http.extraHttpHeadersToCapture;
    return;
  } else if (!userHeaders && fromEnvVar) {
    finalConfig.tracing.http.extraHttpHeadersToCapture = fromEnvVar;
    logger.debug(`[config] env:INSTANA_EXTRA_HTTP_HEADERS = ${process.env.INSTANA_EXTRA_HTTP_HEADERS}`);
    return;
  } else if (finalConfig.tracing.http.extraHttpHeadersToCapture) {
    logger.debug('[config] incode:config.tracing.http.extraHttpHeadersToCapture');
  }

  if (!Array.isArray(userHeaders)) {
    logger.warn(
      // eslint-disable-next-line max-len
      `Invalid configuration: config.tracing.http.extraHttpHeadersToCapture is not an array, the value will be ignored: ${JSON.stringify(
        userHeaders
      )}`
    );
    finalConfig.tracing.http.extraHttpHeadersToCapture = defaultConfig.tracing.http.extraHttpHeadersToCapture;
    return;
  }

  finalConfig.tracing.http.extraHttpHeadersToCapture = userHeaders.map(s => s.toLowerCase());
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
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeTracingStackTrace(userConfig, defaultConfig, finalConfig) {
  const userTracingConfig = userConfig.tracing;
  const userGlobal = userTracingConfig?.global;

  const envStackTrace = process.env.INSTANA_STACK_TRACE;
  const envStackTraceLength = process.env.INSTANA_STACK_TRACE_LENGTH;

  if (envStackTrace !== undefined) {
    const result = validateStackTraceMode(envStackTrace);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceModeFromEnv(envStackTrace);
      if (normalized !== null) {
        finalConfig.tracing.stackTrace = normalized;
      } else {
        finalConfig.tracing.stackTrace = defaultConfig.tracing.stackTrace;
      }
    } else {
      logger.warn(`Invalid env INSTANA_STACK_TRACE: ${result.error}`);
      finalConfig.tracing.stackTrace = defaultConfig.tracing.stackTrace;
    }
  } else if (userGlobal?.stackTrace !== undefined) {
    const result = validateStackTraceMode(userGlobal.stackTrace);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceMode(userConfig);
      if (normalized !== null) {
        finalConfig.tracing.stackTrace = normalized;
      } else {
        finalConfig.tracing.stackTrace = defaultConfig.tracing.stackTrace;
      }
    } else {
      logger.warn(`Invalid config.tracing.global.stackTrace: ${result.error}`);
      finalConfig.tracing.stackTrace = defaultConfig.tracing.stackTrace;
    }
  } else {
    finalConfig.tracing.stackTrace = defaultConfig.tracing.stackTrace;
  }

  const isLegacyLengthDefined = userTracingConfig?.stackTraceLength !== undefined;
  const stackTraceConfigValue = userGlobal?.stackTraceLength || userTracingConfig?.stackTraceLength;

  if (envStackTraceLength !== undefined) {
    const result = validateStackTraceLength(envStackTraceLength);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceLengthFromEnv(envStackTraceLength);
      if (normalized !== null) {
        finalConfig.tracing.stackTraceLength = normalized;
      } else {
        finalConfig.tracing.stackTraceLength = defaultConfig.tracing.stackTraceLength;
      }
    } else {
      logger.warn(`Invalid env INSTANA_STACK_TRACE_LENGTH: ${result.error}`);
      finalConfig.tracing.stackTraceLength = defaultConfig.tracing.stackTraceLength;
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
        finalConfig.tracing.stackTraceLength = normalized;
      } else {
        finalConfig.tracing.stackTraceLength = defaultConfig.tracing.stackTraceLength;
      }
    } else {
      logger.warn(`Invalid stackTraceLength value: ${result.error}`);
      finalConfig.tracing.stackTraceLength = defaultConfig.tracing.stackTraceLength;
    }
  } else {
    finalConfig.tracing.stackTraceLength = defaultConfig.tracing.stackTraceLength;
  }
}

/**
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeDisableTracing(userConfig, defaultConfig, finalConfig) {
  const tempConfig = {
    tracing: userConfig.tracing ? { ...userConfig.tracing } : {}
  };

  const disableConfig = configNormalizers.disable.normalize(tempConfig);

  // If tracing is globally disabled (via `disable: true` or INSTANA_TRACING_DISABLE=true ),
  // mark `tracing.enabled` as false and clear any specific disable rules.
  if (disableConfig === true) {
    finalConfig.tracing.enabled = false;
    finalConfig.tracing.disable = {};
    return;
  }

  if (typeof disableConfig === 'object' && (disableConfig.instrumentations?.length || disableConfig.groups?.length)) {
    finalConfig.tracing.disable = disableConfig;
    return;
  }
  finalConfig.tracing.disable = defaultConfig.tracing.disable;
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeSpanBatchingEnabled(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.spanBatchingEnabled = util.resolveBooleanConfig({
    envVar: 'INSTANA_SPANBATCHING_ENABLED',
    configValue: userConfig.tracing.spanBatchingEnabled,
    defaultValue: defaultConfig.tracing.spanBatchingEnabled,
    configPath: 'config.tracing.spanBatchingEnabled'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeDisableW3cTraceCorrelation(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.disableW3cTraceCorrelation = util.resolveBooleanConfigWithTruthyEnv({
    envVar: 'INSTANA_DISABLE_W3C_TRACE_CORRELATION',
    configValue: userConfig.tracing.disableW3cTraceCorrelation,
    defaultValue: defaultConfig.tracing.disableW3cTraceCorrelation,
    configPath: 'config.tracing.disableW3cTraceCorrelation'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeTracingKafka(userConfig, defaultConfig, finalConfig) {
  const userKafka = userConfig.tracing.kafka;
  finalConfig.tracing.kafka = {};

  finalConfig.tracing.kafka.traceCorrelation = util.resolveBooleanConfig({
    envVar: 'INSTANA_KAFKA_TRACE_CORRELATION',
    configValue: userKafka?.traceCorrelation,
    defaultValue: defaultConfig.tracing.kafka.traceCorrelation,
    configPath: 'config.tracing.kafka.traceCorrelation'
  });
}

/**
 * NOTE: This normalization logic is not handled in the resolver.
 * because it involves complex multi-step processing:
 * Future improvement: Consider refactoring to use a more generic resolver pattern.
 *
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeSecrets(userConfig, defaultConfig, finalConfig) {
  const userSecrets = userConfig.secrets;
  finalConfig.secrets = {};

  /** @type {InstanaSecretsOption} */
  let fromEnvVar = {};
  if (process.env.INSTANA_SECRETS) {
    fromEnvVar = parseSecretsEnvVar(process.env.INSTANA_SECRETS);
  }

  if (finalConfig.secrets.matcherMode) {
    logger.debug(`[config] incode:config.secrets.matcherMode = ${finalConfig.secrets.matcherMode}`);
  } else if (fromEnvVar.matcherMode) {
    logger.debug(`[config] env:INSTANA_SECRETS (matcherMode) = ${fromEnvVar.matcherMode}`);
  }

  if (finalConfig.secrets.keywords) {
    logger.debug('[config] incode:config.secrets.keywords');
  } else if (fromEnvVar.keywords) {
    logger.debug('[config] env:INSTANA_SECRETS (keywords)');
  }
  const matcherMode = userSecrets?.matcherMode || fromEnvVar.matcherMode || defaultConfig.secrets.matcherMode;

  const keywords = userSecrets?.keywords || fromEnvVar.keywords || defaultConfig.secrets.keywords;

  if (typeof matcherMode !== 'string') {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.matcherMode ("${matcherMode}") is not a string. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    finalConfig.secrets.matcherMode = defaultConfig.secrets.matcherMode;
  } else if (validSecretsMatcherModes.indexOf(matcherMode) < 0) {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.matcherMode (or the matcher mode parsed from INSTANA_SECRETS) (${matcherMode}) is not a supported matcher mode. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    finalConfig.secrets.matcherMode = defaultConfig.secrets.matcherMode;
  } else {
    finalConfig.secrets.matcherMode = matcherMode;
  }

  if (!Array.isArray(keywords)) {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.keywords (${keywords}) is not an array. Assuming the default value ${defaults.secrets.keywords}.`
    );
    finalConfig.secrets.keywords = defaultConfig.secrets.keywords;
  } else {
    finalConfig.secrets.keywords = keywords;
  }

  if (finalConfig.secrets.matcherMode === 'none') {
    finalConfig.secrets.keywords = [];
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
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeIgnoreEndpoints(userConfig, defaultConfig, finalConfig) {
  const userIgnoreEndpoints = userConfig.tracing.ignoreEndpoints;

  if (userIgnoreEndpoints && (typeof userIgnoreEndpoints !== 'object' || Array.isArray(userIgnoreEndpoints))) {
    logger.warn(
      `Invalid tracing.ignoreEndpoints configuration. Expected an object, but received: ${JSON.stringify(
        userIgnoreEndpoints
      )}`
    );
    finalConfig.tracing.ignoreEndpoints = {};
    return;
  }

  // Case 1: Use in-code configuration if available
  if (userIgnoreEndpoints && Object.keys(userIgnoreEndpoints).length) {
    finalConfig.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.normalizeConfig(userIgnoreEndpoints);
    logger.debug('[config] incode:config.tracing.ignoreEndpoints');
    return;
  }

  // Case 2: Load from a YAML file if `INSTANA_IGNORE_ENDPOINTS_PATH` is set
  // Introduced in Phase 2 for advanced filtering based on both methods and endpoints.
  // Also supports basic filtering for endpoints.
  if (process.env.INSTANA_IGNORE_ENDPOINTS_PATH) {
    finalConfig.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromYaml(
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH
    );
    logger.debug('[config] env:INSTANA_IGNORE_ENDPOINTS_PATH');
    return;
  }

  // Case 3: Load from the `INSTANA_IGNORE_ENDPOINTS` environment variable
  // Introduced in Phase 1 for basic filtering based only on operations (e.g., `redis.get`, `kafka.consume`).
  // Provides a simple way to configure ignored operations via environment variables.
  if (process.env.INSTANA_IGNORE_ENDPOINTS) {
    finalConfig.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromEnv(
      process.env.INSTANA_IGNORE_ENDPOINTS
    );
    logger.debug('[config] env:INSTANA_IGNORE_ENDPOINTS');
    return;
  }

  finalConfig.tracing.ignoreEndpoints = defaultConfig.tracing.ignoreEndpoints;
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeIgnoreEndpointsDisableSuppression(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.ignoreEndpointsDisableSuppression = util.resolveBooleanConfig({
    envVar: 'INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION',
    configValue: userConfig.tracing.ignoreEndpointsDisableSuppression,
    defaultValue: defaultConfig.tracing.ignoreEndpointsDisableSuppression,
    configPath: 'config.tracing.ignoreEndpointsDisableSuppression'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizeDisableEOLEvents(userConfig, defaultConfig, finalConfig) {
  finalConfig.tracing.disableEOLEvents = util.resolveBooleanConfig({
    envVar: 'INSTANA_TRACING_DISABLE_EOL_EVENTS',
    configValue: userConfig.tracing.disableEOLEvents,
    defaultValue: defaultConfig.tracing.disableEOLEvents,
    configPath: 'config.tracing.disableEOLEvents'
  });
}

/**
 * @param {InstanaConfig|null} userConfig
 * @param {InstanaConfig} defaultConfig
 * @param {InstanaConfig} finalConfig
 */
function normalizePreloadOpentelemetry(userConfig, defaultConfig, finalConfig) {
  if (userConfig.preloadOpentelemetry === true) {
    finalConfig.preloadOpentelemetry = true;
  } else {
    finalConfig.preloadOpentelemetry = defaultConfig.preloadOpentelemetry;
  }
}
