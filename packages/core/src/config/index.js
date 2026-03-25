/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable */

'use strict';

const supportedTracingVersion = require('../tracing/supportedVersion');
const configNormalizers = require('./configNormalizers');
const configValidators = require('./configValidators');
const deepMerge = require('../util/deepMerge');
const { DEFAULT_STACK_TRACE_LENGTH, DEFAULT_STACK_TRACE_MODE } = require('../util/constants');
const { validateStackTraceMode, validateStackTraceLength } = require('./configValidators/stackTraceValidation');

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
  if (process.env['INSTANA_SERVICE_NAME']) {
    logger.debug(
      `Service name has been configured via environment variable INSTANA_SERVICE_NAME: ${process.env['INSTANA_SERVICE_NAME']}`
    );
    config.serviceName = process.env['INSTANA_SERVICE_NAME'];
  } else if (config.serviceName != null && typeof config.serviceName === 'string') {
    logger.debug(`Service name has been configured via config: ${config.serviceName}`);
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
  if (process.env['INSTANA_PACKAGE_JSON_PATH']) {
    logger.debug(
      `Package JSON path has been configured via environment variable INSTANA_PACKAGE_JSON_PATH: ${process.env['INSTANA_PACKAGE_JSON_PATH']}`
    );
    config.packageJsonPath = process.env['INSTANA_PACKAGE_JSON_PATH'];
  } else if (config.packageJsonPath != null && typeof config.packageJsonPath === 'string') {
    logger.debug(`Package JSON path has been configured via config: ${config.packageJsonPath}`);
  }
  if (config.packageJsonPath != null && typeof config.packageJsonPath !== 'string') {
    logger.warn(
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

  config.metrics.transmissionDelay = normalizeSingleValue(
    config.metrics.transmissionDelay,
    defaults.metrics.transmissionDelay,
    'config.metrics.transmissionDelay',
    'INSTANA_METRICS_TRANSMISSION_DELAY'
  );

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
  if (process.env['INSTANA_TRACING_DISABLE'] === 'true') {
    logger.debug('Not enabling tracing as it is explicitly disabled via environment variable INSTANA_TRACING_DISABLE.');
    config.tracing.enabled = false;
    return;
  }

  if (process.env['INSTANA_TRACING_DISABLE'] === 'false') {
    logger.debug('Tracing has been enabled via environment variable INSTANA_TRACING_DISABLE.');
    config.tracing.enabled = true;
    return;
  }

  if (config.tracing.enabled === false) {
    logger.debug('Not enabling tracing as it is explicitly disabled via config.');
    return;
  }
  if (config.tracing.enabled === true) {
    return;
  }

  config.tracing.enabled = defaults.tracing.enabled;
}

/**
 *
 * @param {InstanaConfig} config
 */

function normalizeAllowRootExitSpan(config) {
  const INSTANA_ALLOW_ROOT_EXIT_SPAN = process.env['INSTANA_ALLOW_ROOT_EXIT_SPAN']?.toLowerCase();

  if (INSTANA_ALLOW_ROOT_EXIT_SPAN === '1' || INSTANA_ALLOW_ROOT_EXIT_SPAN === 'true') {
    logger.debug('Allow root exit span has been enabled via environment variable INSTANA_ALLOW_ROOT_EXIT_SPAN.');
    config.tracing.allowRootExitSpan = true;
    return;
  }

  if (INSTANA_ALLOW_ROOT_EXIT_SPAN === '0' || INSTANA_ALLOW_ROOT_EXIT_SPAN === 'false') {
    logger.debug('Allow root exit span has been disabled via environment variable INSTANA_ALLOW_ROOT_EXIT_SPAN.');
    config.tracing.allowRootExitSpan = false;
    return;
  }

  if (config.tracing.allowRootExitSpan === false) {
    logger.debug('Allow root exit span has been disabled via config.');
    return;
  }
  if (config.tracing.allowRootExitSpan === true) {
    logger.debug('Allow root exit span has been enabled via config.');
    return;
  }

  config.tracing.allowRootExitSpan = defaults.tracing.allowRootExitSpan;
}

/**
 *
 * @param {InstanaConfig} config
 */
function normalizeUseOpentelemetry(config) {
  if (process.env['INSTANA_DISABLE_USE_OPENTELEMETRY'] === 'true') {
    logger.debug('OpenTelemetry usage has been disabled via environment variable INSTANA_DISABLE_USE_OPENTELEMETRY.');
    config.tracing.useOpentelemetry = false;
    return;
  }

  if (process.env['INSTANA_DISABLE_USE_OPENTELEMETRY'] === 'false') {
    logger.debug('OpenTelemetry usage has been enabled via environment variable INSTANA_DISABLE_USE_OPENTELEMETRY.');
    config.tracing.useOpentelemetry = true;
    return;
  }

  if (config.tracing.useOpentelemetry === false) {
    logger.debug('OpenTelemetry usage has been disabled via config.');
    return;
  }
  if (config.tracing.useOpentelemetry === true) {
    logger.debug('OpenTelemetry usage has been enabled via config.');
    return;
  }

  config.tracing.useOpentelemetry = defaults.tracing.useOpentelemetry;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeAutomaticTracingEnabled(config) {
  if (!config.tracing.enabled) {
    logger.debug('Not enabling automatic tracing as tracing in general is explicitly disabled.');
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  if (process.env['INSTANA_DISABLE_AUTO_INSTR'] === 'true') {
    logger.debug(
      'Not enabling automatic tracing as it is explicitly disabled via environment variable INSTANA_DISABLE_AUTO_INSTR.'
    );
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  if (config.tracing.automaticTracingEnabled === false) {
    logger.debug('Not enabling automatic tracing as it is explicitly disabled via config.');
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  if (!supportedTracingVersion(process.versions.node)) {
    logger.warn(
      'Not enabling automatic tracing, this is an unsupported version of Node.js. ' +
        'See: https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-support-information#supported-nodejs-versions'
    );
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  config.tracing.automaticTracingEnabled = defaults.tracing.automaticTracingEnabled;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeActivateImmediately(config) {
  if (!config.tracing.enabled) {
    config.tracing.activateImmediately = false;
    return;
  }

  if (process.env['INSTANA_TRACE_IMMEDIATELY'] === 'true') {
    logger.debug('Tracing will activate immediately via environment variable INSTANA_TRACE_IMMEDIATELY.');
    config.tracing.activateImmediately = true;
    return;
  }

  if (process.env['INSTANA_TRACE_IMMEDIATELY'] === 'false') {
    logger.debug('Tracing will not activate immediately via environment variable INSTANA_TRACE_IMMEDIATELY.');
    config.tracing.activateImmediately = false;
    return;
  }

  if (typeof config.tracing.activateImmediately === 'boolean') {
    if (config.tracing.activateImmediately) {
      logger.debug('Tracing will activate immediately via config.');
    }
    return;
  }

  config.tracing.activateImmediately = defaults.tracing.activateImmediately;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingTransmission(config) {
  config.tracing.maxBufferedSpans = config.tracing.maxBufferedSpans || defaults.tracing.maxBufferedSpans;

  config.tracing.transmissionDelay = normalizeSingleValue(
    config.tracing.transmissionDelay,
    defaults.tracing.transmissionDelay,
    'config.tracing.transmissionDelay',
    'INSTANA_TRACING_TRANSMISSION_DELAY'
  );

  // DEPRECATED! This was never documented, but we shared it with a customer.
  if (process.env['INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS']) {
    logger.warn(
      'The environment variable INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS is deprecated and will be removed in the next major release. ' +
        'Please use INSTANA_TRACING_TRANSMISSION_DELAY instead.'
    );

    config.tracing.transmissionDelay = parseInt(process.env['INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS'], 10);

    if (isNaN(config.tracing.transmissionDelay)) {
      logger.warn(
        `The value of INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS is not a number. Falling back to the default value ${defaults.tracing.transmissionDelay}.`
      );

      config.tracing.transmissionDelay = defaults.tracing.transmissionDelay;
    }
  }

  config.tracing.forceTransmissionStartingAt = normalizeSingleValue(
    config.tracing.forceTransmissionStartingAt,
    defaults.tracing.forceTransmissionStartingAt,
    'config.tracing.forceTransmissionStartingAt',
    'INSTANA_FORCE_TRANSMISSION_STARTING_AT'
  );

  config.tracing.initialTransmissionDelay = normalizeSingleValue(
    config.tracing.initialTransmissionDelay,
    defaults.tracing.initialTransmissionDelay,
    'config.tracing.initialTransmissionDelay',
    'INSTANA_TRACING_INITIAL_TRANSMISSION_DELAY'
  );
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingHttp(config) {
  config.tracing.http = config.tracing.http || {};

  let headersFromEnv;
  if (process.env.INSTANA_EXTRA_HTTP_HEADERS) {
    headersFromEnv = parseHeadersEnvVar(process.env.INSTANA_EXTRA_HTTP_HEADERS);
  }

  const headersFromConfig = config.tracing.http.extraHttpHeadersToCapture;
  const isValidEnvHeaders = Array.isArray(headersFromEnv) && headersFromEnv.length > 0;

  const isValidConfigHeaders = Array.isArray(headersFromConfig) && headersFromConfig.length > 0;

  let resolvedHeaders;

  if (isValidEnvHeaders) {
    resolvedHeaders = headersFromEnv;
  } else if (isValidConfigHeaders) {
    resolvedHeaders = headersFromConfig;
  } else {
    resolvedHeaders = defaults.tracing.http.extraHttpHeadersToCapture;
  }

  if (!Array.isArray(resolvedHeaders)) {
    logger.warn(
      `Invalid configuration: extraHttpHeadersToCapture must be an array. Falling back to defaults: ${JSON.stringify(
        resolvedHeaders
      )}`
    );
    resolvedHeaders = defaults.tracing.http.extraHttpHeadersToCapture;
  }
  // Node.js HTTP API turns all incoming HTTP headers into lowercase.
  config.tracing.http.extraHttpHeadersToCapture = resolvedHeaders.map(h => h.toLowerCase());
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

  const envStackTrace = process.env['INSTANA_STACK_TRACE'];
  const envStackTraceLength = process.env['INSTANA_STACK_TRACE_LENGTH'];

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
  if (process.env['INSTANA_SPANBATCHING_ENABLED'] === 'true') {
    logger.debug('Span batching is enabled via environment variable INSTANA_SPANBATCHING_ENABLED.');
    config.tracing.spanBatchingEnabled = true;
    return;
  }

  if (process.env['INSTANA_SPANBATCHING_ENABLED'] === 'false') {
    logger.debug('Span batching is disabled via environment variable INSTANA_SPANBATCHING_ENABLED.');
    config.tracing.spanBatchingEnabled = false;
    return;
  }

  if (config.tracing.spanBatchingEnabled != null) {
    if (typeof config.tracing.spanBatchingEnabled === 'boolean') {
      if (config.tracing.spanBatchingEnabled) {
        logger.debug('Span batching is enabled via config.');
      }
      return;
    } else {
      logger.warn(
        `Invalid configuration: config.tracing.spanBatchingEnabled is not a boolean value, will be ignored: ${JSON.stringify(
          config.tracing.spanBatchingEnabled
        )}`
      );
    }
  }

  config.tracing.spanBatchingEnabled = defaults.tracing.spanBatchingEnabled;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableW3cTraceCorrelation(config) {
  // any non-empty string will disable, even "false"!
  if (process.env['INSTANA_DISABLE_W3C_TRACE_CORRELATION']) {
    logger.debug(
      'W3C trace correlation has been disabled via environment variable INSTANA_DISABLE_W3C_TRACE_CORRELATION.'
    );
    config.tracing.disableW3cTraceCorrelation = true;
    return;
  }

  if (config.tracing.disableW3cTraceCorrelation === true) {
    logger.debug('W3C trace correlation has been disabled via config.');
    return;
  }

  config.tracing.disableW3cTraceCorrelation = defaults.tracing.disableW3cTraceCorrelation;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingKafka(config) {
  config.tracing.kafka = config.tracing.kafka || {};

  if (
    process.env['INSTANA_KAFKA_TRACE_CORRELATION'] != null &&
    process.env['INSTANA_KAFKA_TRACE_CORRELATION'].toLowerCase() === 'false'
  ) {
    logger.debug('Kafka trace correlation has been disabled via environment variable INSTANA_KAFKA_TRACE_CORRELATION.');
    config.tracing.kafka.traceCorrelation = false;
  } else if (
    process.env['INSTANA_KAFKA_TRACE_CORRELATION'] != null &&
    process.env['INSTANA_KAFKA_TRACE_CORRELATION'].toLowerCase() === 'true'
  ) {
    logger.debug('Kafka trace correlation has been enabled via environment variable INSTANA_KAFKA_TRACE_CORRELATION.');
    config.tracing.kafka.traceCorrelation = true;
  } else if (config.tracing.kafka.traceCorrelation === false) {
    logger.debug('Kafka trace correlation has been disabled via config.');
  } else {
    config.tracing.kafka.traceCorrelation = defaults.tracing.kafka.traceCorrelation;
  }
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

  config.secrets.matcherMode = fromEnvVar.matcherMode || config.secrets.matcherMode || defaults.secrets.matcherMode;
  config.secrets.keywords = fromEnvVar.keywords || config.secrets.keywords || defaults.secrets.keywords;

  if (typeof config.secrets.matcherMode !== 'string') {
    logger.warn(
      `The value of config.secrets.matcherMode ("${config.secrets.matcherMode}") is not a string. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    config.secrets.matcherMode = defaults.secrets.matcherMode;
  } else if (validSecretsMatcherModes.indexOf(config.secrets.matcherMode) < 0) {
    logger.warn(
      `The value of config.secrets.matcherMode (or the matcher mode parsed from INSTANA_SECRETS) (${config.secrets.matcherMode}) is not a supported matcher mode. Assuming the default value ${defaults.secrets.matcherMode}.`
    );
    config.secrets.matcherMode = defaults.secrets.matcherMode;
  } else if (!Array.isArray(config.secrets.keywords)) {
    logger.warn(
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
  let [matcherMode, keywords] = envVarValue.split(':', 2);

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
 * @param {*} configValue
 * @param {*} defaultValue
 * @param {string} configPath
 * @param {string} envVarKey
 * @returns {*}
 */
function normalizeSingleValue(configValue, defaultValue, configPath, envVarKey) {
  const envVarVal = process.env[envVarKey];

  if (envVarVal != null) {
    const parsed = parseInt(envVarVal, 10);
    if (typeof parsed !== 'number' || isNaN(parsed)) {
      logger.warn(
        `The value of ${envVarKey} ("${envVarVal}") is not numerical or cannot be parsed to a numerical value. Assuming the default value ${defaultValue}.`
      );
      return defaultValue;
    }
    return parsed;
  }

  if (configValue != null) {
    if (typeof configValue !== 'number' || isNaN(configValue)) {
      logger.warn(
        `The value of ${configPath} ("${configValue}") is not numerical or cannot be parsed to a numerical value. Assuming the default value ${defaultValue}.`
      );
      return defaultValue;
    }
    return configValue;
  }
  return defaultValue;
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

  // Case 1: Load from a YAML file if `INSTANA_IGNORE_ENDPOINTS_PATH` is set (highest env var priority)
  // Introduced in Phase 2 for advanced filtering based on both methods and endpoints.
  if (process.env.INSTANA_IGNORE_ENDPOINTS_PATH) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromYaml(
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH
    );
    logger.debug(
      `Ignore endpoints have been configured via environment variable INSTANA_IGNORE_ENDPOINTS_PATH: ${JSON.stringify(
        config.tracing.ignoreEndpoints
      )}`
    );
    return;
  }

  // Case 2: Load from the `INSTANA_IGNORE_ENDPOINTS` environment variable
  // Introduced in Phase 1 for basic filtering based only on operations (e.g., `redis.get`, `kafka.consume`).
  if (process.env.INSTANA_IGNORE_ENDPOINTS) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromEnv(process.env.INSTANA_IGNORE_ENDPOINTS);
    logger.debug(
      `Ignore endpoints have been configured via environment variable INSTANA_IGNORE_ENDPOINTS:: ${JSON.stringify(
        config.tracing.ignoreEndpoints
      )}`
    );
    return;
  }

  // Case 3: Use in-code configuration if available
  if (Object.keys(ignoreEndpointsConfig).length) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.normalizeConfig(ignoreEndpointsConfig);
    logger.debug(`Ignore endpoints have been configured: ${JSON.stringify(config.tracing.ignoreEndpoints)}`);
    return;
  }
}

/**
 * @param {InstanaConfig} config
 */
function normalizeIgnoreEndpointsDisableSuppression(config) {
  if (process.env['INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION'] === 'true') {
    logger.debug(
      'Disabling downstream suppression for ignoring endpoints feature as it is explicitly disabled via environment variable "INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION".'
    );
    config.tracing.ignoreEndpointsDisableSuppression = true;
    return;
  }

  if (process.env['INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION'] === 'false') {
    logger.debug(
      'Enabling downstream suppression for ignoring endpoints feature via environment variable "INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION".'
    );
    config.tracing.ignoreEndpointsDisableSuppression = false;
    return;
  }

  if (config.tracing.ignoreEndpointsDisableSuppression === true) {
    logger.debug(
      'Disabling downstream suppression for ignoring endpoints feature as it is explicitly disabled via config.'
    );
    return;
  }

  config.tracing.ignoreEndpointsDisableSuppression = defaults.tracing.ignoreEndpointsDisableSuppression;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableEOLEvents(config) {
  config.tracing = config.tracing || {};

  if (process.env['INSTANA_TRACING_DISABLE_EOL_EVENTS'] === 'true') {
    logger.debug(
      'Disabling EOL events as it is explicitly disabled via environment variable "INSTANA_TRACING_DISABLE_EOL_EVENTS".'
    );
    config.tracing.disableEOLEvents = true;
    return;
  }

  if (process.env['INSTANA_TRACING_DISABLE_EOL_EVENTS'] === 'false') {
    logger.debug('Enabling EOL events via environment variable "INSTANA_TRACING_DISABLE_EOL_EVENTS".');
    config.tracing.disableEOLEvents = false;
    return;
  }

  if (config.tracing.disableEOLEvents === true) {
    logger.debug('Disabling EOL events as it is explicitly disabled via config.');
    return;
  }

  config.tracing.disableEOLEvents = defaults.tracing.disableEOLEvents;
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
