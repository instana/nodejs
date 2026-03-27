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

const transmissionDelayMaxValue = 5000;

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

  /** @type InstanaConfig */
  let targetConfig = {};

  // NOTE: Do not modify the original object
  if (userConfig !== null) {
    targetConfig = Object.assign({}, userConfig);
  }

  // TODO: remove this and forward the logger via init fn.
  targetConfig.logger = logger;

  normalizeServiceName(targetConfig);
  normalizePackageJsonPath(targetConfig);
  normalizeMetricsConfig(targetConfig);
  normalizeTracingConfig(targetConfig);
  normalizeSecrets(targetConfig);
  normalizePreloadOpentelemetry(targetConfig);
  return targetConfig;
};

/**
 * @param {InstanaConfig} config
 */
function normalizeServiceName(config) {
  if (config.serviceName == null && process.env.INSTANA_SERVICE_NAME) {
    config.serviceName = process.env.INSTANA_SERVICE_NAME;
  }
  if (config.serviceName != null && typeof config.serviceName !== 'string') {
    logger.warn(
      `Invalid configuration: config.serviceName is not a string, the value will be ignored: ${config.serviceName}`
    );
    config.serviceName = defaults.serviceName;
  }
}

/**
 * @param {InstanaConfig} config
 */
function normalizePackageJsonPath(config) {
  if (config.packageJsonPath == null && process.env.INSTANA_PACKAGE_JSON_PATH) {
    config.packageJsonPath = process.env.INSTANA_PACKAGE_JSON_PATH;
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
 * @param {InstanaConfig} config
 */
function normalizeMetricsConfig(config) {
  if (config.metrics == null) {
    config.metrics = {};
  }

  config.metrics.transmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_METRICS_TRANSMISSION_DELAY',
    configValue: config.metrics.transmissionDelay,
    defaultValue: defaults.metrics.transmissionDelay,
    configPath: 'config.metrics.transmissionDelay'
  });

  // Validate max value for transmissionDelay
  if (config.metrics.transmissionDelay > transmissionDelayMaxValue) {
    logger.warn(
      `The value of config.metrics.transmissionDelay (or INSTANA_METRICS_TRANSMISSION_DELAY) (${config.metrics.transmissionDelay}) exceeds the maximum allowed value of ${transmissionDelayMaxValue}. Assuming the max value ${transmissionDelayMaxValue}.`
    );
    config.metrics.transmissionDelay = transmissionDelayMaxValue;
  }

  config.metrics.timeBetweenHealthcheckCalls =
    config.metrics.timeBetweenHealthcheckCalls || defaults.metrics.timeBetweenHealthcheckCalls;
}

/**
 *
 * @param {InstanaConfig} config
 */
function normalizeTracingConfig(config) {
  if (config.tracing == null) {
    config.tracing = {};
  }
  normalizeTracingEnabled(config);
  normalizeUseOpentelemetry(config);
  normalizeDisableTracing(config);
  normalizeAutomaticTracingEnabled(config);
  normalizeActivateImmediately(config);
  normalizeTracingTransmission(config);
  normalizeTracingHttp(config);
  normalizeTracingStackTrace(config);
  normalizeSpanBatchingEnabled(config);
  normalizeDisableW3cTraceCorrelation(config);
  normalizeTracingKafka(config);
  normalizeAllowRootExitSpan(config);
  normalizeIgnoreEndpoints(config);
  normalizeIgnoreEndpointsDisableSuppression(config);
  normalizeDisableEOLEvents(config);
}

/**
 *
 * @param {InstanaConfig} config
 */
function normalizeTracingEnabled(config) {
  config.tracing.enabled = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_TRACING_DISABLE',
    configValue: config.tracing.enabled,
    defaultValue: defaults.tracing.enabled,
    configPath: 'config.tracing.enabled'
  });
}

/**
 *
 * @param {InstanaConfig} config
 */
function normalizeAllowRootExitSpan(config) {
  config.tracing.allowRootExitSpan = util.resolveBooleanConfig({
    envVar: 'INSTANA_ALLOW_ROOT_EXIT_SPAN',
    configValue: config.tracing.allowRootExitSpan,
    defaultValue: defaults.tracing.allowRootExitSpan,
    configPath: 'config.tracing.allowRootExitSpan'
  });
}

/**
 *
 * @param {InstanaConfig} config
 */
function normalizeUseOpentelemetry(config) {
  config.tracing.useOpentelemetry = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_DISABLE_USE_OPENTELEMETRY',
    configValue: config.tracing.useOpentelemetry,
    defaultValue: defaults.tracing.useOpentelemetry,
    configPath: 'config.tracing.useOpentelemetry'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeAutomaticTracingEnabled(config) {
  if (!config.tracing.enabled) {
    logger.info('Not enabling automatic tracing as tracing in general is explicitly disabled via config.');
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  config.tracing.automaticTracingEnabled = util.resolveBooleanConfigWithInvertedEnv({
    envVar: 'INSTANA_DISABLE_AUTO_INSTR',
    configValue: config.tracing.automaticTracingEnabled,
    defaultValue: defaults.tracing.automaticTracingEnabled,
    configPath: 'config.tracing.automaticTracingEnabled'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeActivateImmediately(config) {
  if (!config.tracing.enabled) {
    config.tracing.activateImmediately = false;
    return;
  }

  config.tracing.activateImmediately = util.resolveBooleanConfig({
    envVar: 'INSTANA_TRACE_IMMEDIATELY',
    configValue: config.tracing.activateImmediately,
    defaultValue: defaults.tracing.activateImmediately,
    configPath: 'config.tracing.activateImmediately'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingTransmission(config) {
  config.tracing.maxBufferedSpans = config.tracing.maxBufferedSpans || defaults.tracing.maxBufferedSpans;

  config.tracing.transmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_TRACING_TRANSMISSION_DELAY',
    configValue: config.tracing.transmissionDelay,
    defaultValue: defaults.tracing.transmissionDelay,
    configPath: 'config.tracing.transmissionDelay'
  });

  config.tracing.forceTransmissionStartingAt = util.resolveNumericConfig({
    envVar: 'INSTANA_FORCE_TRANSMISSION_STARTING_AT',
    configValue: config.tracing.forceTransmissionStartingAt,
    defaultValue: defaults.tracing.forceTransmissionStartingAt,
    configPath: 'config.tracing.forceTransmissionStartingAt'
  });

  config.tracing.initialTransmissionDelay = util.resolveNumericConfig({
    envVar: 'INSTANA_TRACING_INITIAL_TRANSMISSION_DELAY',
    configValue: config.tracing.initialTransmissionDelay,
    defaultValue: defaults.tracing.initialTransmissionDelay,
    configPath: 'config.tracing.initialTransmissionDelay'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingHttp(config) {
  config.tracing.http = config.tracing.http || {};

  let fromEnvVar;
  if (process.env.INSTANA_EXTRA_HTTP_HEADERS) {
    fromEnvVar = parseHeadersEnvVar(process.env.INSTANA_EXTRA_HTTP_HEADERS);
  }

  if (!config.tracing.http.extraHttpHeadersToCapture && !fromEnvVar) {
    config.tracing.http.extraHttpHeadersToCapture = defaults.tracing.http.extraHttpHeadersToCapture;
    return;
  } else if (!config.tracing.http.extraHttpHeadersToCapture && fromEnvVar) {
    config.tracing.http.extraHttpHeadersToCapture = fromEnvVar;
  }
  if (!Array.isArray(config.tracing.http.extraHttpHeadersToCapture)) {
    logger.warn(
      // eslint-disable-next-line max-len
      `Invalid configuration: config.tracing.http.extraHttpHeadersToCapture is not an array, the value will be ignored: ${JSON.stringify(
        config.tracing.http.extraHttpHeadersToCapture
      )}`
    );
    config.tracing.http.extraHttpHeadersToCapture = defaults.tracing.http.extraHttpHeadersToCapture;
    return;
  }

  config.tracing.http.extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture.map(
    (
      s // Node.js HTTP API turns all incoming HTTP headers into lowercase.
    ) => s.toLowerCase()
  );
}

/**
 * @param {string} envVarValue
 * @returns {Array<string>}
 */
function parseHeadersEnvVar(envVarValue) {
  return envVarValue
    .split(/[;,]/)
    .map(header => header.trim())
    .filter(header => header !== '');
}

/**
 * Handles both stackTrace and stackTraceLength configuration
 * @param {InstanaConfig} config
 */
function normalizeTracingStackTrace(config) {
  const tracing = config.tracing;

  const envStackTrace = process.env.INSTANA_STACK_TRACE;
  const envStackTraceLength = process.env.INSTANA_STACK_TRACE_LENGTH;

  if (envStackTrace !== undefined) {
    const result = validateStackTraceMode(envStackTrace);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceModeFromEnv(envStackTrace);
      if (normalized !== null) {
        tracing.stackTrace = normalized;
      } else {
        tracing.stackTrace = defaults.tracing.stackTrace;
      }
    } else {
      logger.warn(`Invalid env INSTANA_STACK_TRACE: ${result.error}`);
      tracing.stackTrace = defaults.tracing.stackTrace;
    }
  } else if (tracing.global?.stackTrace !== undefined) {
    const result = validateStackTraceMode(tracing.global.stackTrace);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceMode(config);
      if (normalized !== null) {
        tracing.stackTrace = normalized;
      } else {
        tracing.stackTrace = defaults.tracing.stackTrace;
      }
    } else {
      logger.warn(`Invalid config.tracing.global.stackTrace: ${result.error}`);
      tracing.stackTrace = defaults.tracing.stackTrace;
    }
  } else {
    tracing.stackTrace = defaults.tracing.stackTrace;
  }

  const isLegacyLengthDefined = tracing.stackTraceLength !== undefined;
  const stackTraceConfigValue = tracing.global?.stackTraceLength || tracing.stackTraceLength;

  if (envStackTraceLength !== undefined) {
    const result = validateStackTraceLength(envStackTraceLength);

    if (result.isValid) {
      const normalized = configNormalizers.stackTrace.normalizeStackTraceLengthFromEnv(envStackTraceLength);
      if (normalized !== null) {
        tracing.stackTraceLength = normalized;
      } else {
        tracing.stackTraceLength = defaults.tracing.stackTraceLength;
      }
    } else {
      logger.warn(`Invalid env INSTANA_STACK_TRACE_LENGTH: ${result.error}`);
      tracing.stackTraceLength = defaults.tracing.stackTraceLength;
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
      const normalized = configNormalizers.stackTrace.normalizeStackTraceLength(config);
      if (normalized !== null) {
        tracing.stackTraceLength = normalized;
      } else {
        tracing.stackTraceLength = defaults.tracing.stackTraceLength;
      }
    } else {
      logger.warn(`Invalid stackTraceLength value: ${result.error}`);
      tracing.stackTraceLength = defaults.tracing.stackTraceLength;
    }
  } else {
    tracing.stackTraceLength = defaults.tracing.stackTraceLength;
  }
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableTracing(config) {
  const disableConfig = configNormalizers.disable.normalize(config);

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
 * @param {InstanaConfig} config
 */
function normalizeSpanBatchingEnabled(config) {
  config.tracing.spanBatchingEnabled = util.resolveBooleanConfig({
    envVar: 'INSTANA_SPANBATCHING_ENABLED',
    configValue: config.tracing.spanBatchingEnabled,
    defaultValue: defaults.tracing.spanBatchingEnabled,
    configPath: 'config.tracing.spanBatchingEnabled'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableW3cTraceCorrelation(config) {
  config.tracing.disableW3cTraceCorrelation = util.resolveBooleanConfigWithTruthyEnv({
    envVar: 'INSTANA_DISABLE_W3C_TRACE_CORRELATION',
    configValue: config.tracing.disableW3cTraceCorrelation,
    defaultValue: defaults.tracing.disableW3cTraceCorrelation
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingKafka(config) {
  config.tracing.kafka = config.tracing.kafka || {};

  config.tracing.kafka.traceCorrelation = util.resolveBooleanConfig({
    envVar: 'INSTANA_KAFKA_TRACE_CORRELATION',
    configValue: config.tracing.kafka.traceCorrelation,
    defaultValue: defaults.tracing.kafka.traceCorrelation,
    configPath: 'config.tracing.kafka.traceCorrelation'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeSecrets(config) {
  if (config.secrets == null) {
    config.secrets = {};
  }

  /** @type {InstanaSecretsOption} */
  let fromEnvVar = {};
  if (process.env.INSTANA_SECRETS) {
    fromEnvVar = parseSecretsEnvVar(process.env.INSTANA_SECRETS);
  }

  config.secrets.matcherMode = config.secrets.matcherMode || fromEnvVar.matcherMode || defaults.secrets.matcherMode;
  config.secrets.keywords = config.secrets.keywords || fromEnvVar.keywords || defaults.secrets.keywords;

  if (typeof config.secrets.matcherMode !== 'string') {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.matcherMode ("${config.secrets.matcherMode}") is not a string. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    config.secrets.matcherMode = defaults.secrets.matcherMode;
  } else if (validSecretsMatcherModes.indexOf(config.secrets.matcherMode) < 0) {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.matcherMode (or the matcher mode parsed from INSTANA_SECRETS) (${config.secrets.matcherMode}) is not a supported matcher mode. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    config.secrets.matcherMode = defaults.secrets.matcherMode;
  } else if (!Array.isArray(config.secrets.keywords)) {
    logger.warn(
      // eslint-disable-next-line max-len
      `The value of config.secrets.keywords (${config.secrets.keywords}) is not an array. Assuming the default value ${defaults.secrets.keywords}.`
    );
    config.secrets.keywords = defaults.secrets.keywords;
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
 * @param {InstanaConfig} config
 */
function normalizeIgnoreEndpoints(config) {
  if (!config.tracing.ignoreEndpoints) {
    config.tracing.ignoreEndpoints = {};
  }

  const ignoreEndpointsConfig = config.tracing.ignoreEndpoints;

  if (typeof ignoreEndpointsConfig !== 'object' || Array.isArray(ignoreEndpointsConfig)) {
    logger.warn(
      `Invalid tracing.ignoreEndpoints configuration. Expected an object, but received: ${JSON.stringify(
        ignoreEndpointsConfig
      )}`
    );
    config.tracing.ignoreEndpoints = {};
    return;
  }
  // Case 1: Use in-code configuration if available
  if (Object.keys(ignoreEndpointsConfig).length) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.normalizeConfig(ignoreEndpointsConfig);
    logger.debug(`Ignore endpoints have been configured: ${JSON.stringify(config.tracing.ignoreEndpoints)}`);
    return;
  }

  // Case 2: Load from a YAML file if `INSTANA_IGNORE_ENDPOINTS_PATH` is set
  // Introduced in Phase 2 for advanced filtering based on both methods and endpoints.
  // Also supports basic filtering for endpoints.
  if (process.env.INSTANA_IGNORE_ENDPOINTS_PATH) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromYaml(
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH
    );

    logger.debug(`Ignore endpoints have been configured: ${JSON.stringify(config.tracing.ignoreEndpoints)}`);
    return;
  }

  // Case 3: Load from the `INSTANA_IGNORE_ENDPOINTS` environment variable
  // Introduced in Phase 1 for basic filtering based only on operations (e.g., `redis.get`, `kafka.consume`).
  // Provides a simple way to configure ignored operations via environment variables.
  if (process.env.INSTANA_IGNORE_ENDPOINTS) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromEnv(process.env.INSTANA_IGNORE_ENDPOINTS);
    logger.debug(`Ignore endpoints have been configured: ${JSON.stringify(config.tracing.ignoreEndpoints)}`);
  }
}

/**
 * @param {InstanaConfig} config
 */
function normalizeIgnoreEndpointsDisableSuppression(config) {
  config.tracing.ignoreEndpointsDisableSuppression = util.resolveBooleanConfig({
    envVar: 'INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION',
    configValue: config.tracing.ignoreEndpointsDisableSuppression,
    defaultValue: defaults.tracing.ignoreEndpointsDisableSuppression,
    configPath: 'config.tracing.ignoreEndpointsDisableSuppression'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableEOLEvents(config) {
  config.tracing.disableEOLEvents = util.resolveBooleanConfig({
    envVar: 'INSTANA_TRACING_DISABLE_EOL_EVENTS',
    configValue: config.tracing.disableEOLEvents,
    defaultValue: defaults.tracing.disableEOLEvents,
    configPath: 'config.tracing.disableEOLEvents'
  });
}

/**
 * @param {InstanaConfig} config
 */
function normalizePreloadOpentelemetry(config) {
  if (config.preloadOpentelemetry === true) {
    return;
  }

  config.preloadOpentelemetry = defaults.preloadOpentelemetry;
}
