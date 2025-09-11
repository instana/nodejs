/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable */

'use strict';

const supportedTracingVersion = require('../tracing/supportedVersion');
const configNormalizers = require('./configNormalizers');
const deepMerge = require('../util/deepMerge');

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
 * @property {number} [stackTraceLength]
 * @property {HTTPTracingOptions} [http]
 * @property {import('../tracing').Disable} [disable]
 * @property {Array<string>} [disabledTracers]
 * @property {boolean} [spanBatchingEnabled]
 * @property {boolean} [disableW3cTraceCorrelation]
 * @property {KafkaTracingOptions} [kafka]
 * @property {boolean} [allowRootExitSpan]
 * @property {import('../tracing').IgnoreEndpoints} [ignoreEndpoints]
 * @property {boolean} [ignoreEndpointsDisableSuppression]
 * @property {boolean} [disableEOLEvents]
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
 */

/**
 * @typedef {Object} AgentConfig
 * @property {AgentTracingConfig} [tracing]
 */

/**
 * @typedef {Object} AgentTracingConfig
 * @property {AgentTracingHttpConfig} [http]
 * @property {AgentTracingKafkaConfig} [kafka]
 * @property {boolean|string} [spanBatchingEnabled]
 * @property {import('../tracing').IgnoreEndpoints} [ignoreEndpoints]
 * @property {import('../tracing').Disable} [disable]
 */

/**
 * @typedef {Object} AgentTracingHttpConfig
 * @property {Array.<string>} [extraHttpHeadersToCapture]
 */

/**
 * @typedef {Object} AgentTracingKafkaConfig
 * @property {boolean} [traceCorrelation]
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
    stackTraceLength: 10,
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
  secrets: {
    matcherMode: 'contains-ignore-case',
    keywords: ['key', 'pass', 'secret']
  }
};

const validSecretsMatcherModes = ['equals-ignore-case', 'equals', 'contains-ignore-case', 'contains', 'regex', 'none'];

module.exports.configNormalizers = configNormalizers;

/**
 * Merges the config that was passed to the init function with environment variables and default values.
 */

/**
 * @param {InstanaConfig} [userConfig]
 * @param {import('../core').GenericLogger} [_logger]
 * @param {InstanaConfig} [defaultsOverride]
 * @returns {InstanaConfig}
 */
module.exports.init = (userConfig, _logger, defaultsOverride = {}) => {
  if (_logger) {
    logger = _logger;
  } else {
    // NOTE: This is only a hard backup. This should not happen. We always pass in
    //       our custom logger from the upper package.
    logger = {
      debug: console.log,
      info: console.log,
      warn: console.warn,
      error: console.error,
      trace: console.trace
    };
  }

  if (defaultsOverride && typeof defaultsOverride === 'object') {
    defaults = deepMerge(defaults, defaultsOverride);
  }

  /** @type InstanaConfig */
  let targetConfig = {};

  // NOTE: Do not modify the original object
  if (userConfig !== null) {
    targetConfig = Object.assign({}, userConfig);
  }

  targetConfig.logger = logger;
  configNormalizers.init({ logger });

  normalizeServiceName(targetConfig);
  normalizePackageJsonPath(targetConfig);
  normalizeMetricsConfig(targetConfig);
  normalizeTracingConfig(targetConfig);
  normalizeSecrets(targetConfig);
  return targetConfig;
};

/**
 * @param {InstanaConfig} config
 */
function normalizeServiceName(config) {
  if (config.serviceName == null && process.env['INSTANA_SERVICE_NAME']) {
    config.serviceName = process.env['INSTANA_SERVICE_NAME'];
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
  if (config.packageJsonPath == null && process.env['INSTANA_PACKAGE_JSON_PATH']) {
    config.packageJsonPath = process.env['INSTANA_PACKAGE_JSON_PATH'];
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
  normalizeTracingStackTraceLength(config);
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
  if (config.tracing.enabled === false) {
    logger.info('Not enabling tracing as it is explicitly disabled via config.');
    return;
  }
  if (config.tracing.enabled === true) {
    return;
  }

  // @deprecated
  if (process.env['INSTANA_DISABLE_TRACING'] === 'true') {
    logger.info('Not enabling tracing as it is explicitly disabled via environment variable INSTANA_DISABLE_TRACING.');
    logger.warn(
      'The environment variable INSTANA_DISABLE_TRACING is deprecated and will be removed in the next major release. ' +
        'Please use INSTANA_TRACING_DISABLE="true" instead.'
    );
    config.tracing.enabled = false;
    return;
  }

  config.tracing.enabled = defaults.tracing.enabled;
}

/**
 *
 * @param {InstanaConfig} config
 */

function normalizeAllowRootExitSpan(config) {
  if (config.tracing.allowRootExitSpan === false) {
    return;
  }
  if (config.tracing.allowRootExitSpan === true) {
    return;
  }

  const INSTANA_ALLOW_ROOT_EXIT_SPAN = process.env['INSTANA_ALLOW_ROOT_EXIT_SPAN']?.toLowerCase();

  config.tracing.allowRootExitSpan =
    INSTANA_ALLOW_ROOT_EXIT_SPAN === '1' ||
    INSTANA_ALLOW_ROOT_EXIT_SPAN === 'true' ||
    defaults.tracing.allowRootExitSpan;
  return;
}

/**
 *
 * @param {InstanaConfig} config
 */
function normalizeUseOpentelemetry(config) {
  if (config.tracing.useOpentelemetry === false) {
    return;
  }
  if (config.tracing.useOpentelemetry === true) {
    return;
  }
  if (process.env['INSTANA_DISABLE_USE_OPENTELEMETRY'] === 'true') {
    config.tracing.useOpentelemetry = false;
    return;
  }

  config.tracing.useOpentelemetry = defaults.tracing.useOpentelemetry;
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

  if (config.tracing.automaticTracingEnabled === false) {
    logger.info('Not enabling automatic tracing as it is explicitly disabled via config.');
    config.tracing.automaticTracingEnabled = false;
    return;
  }

  if (process.env['INSTANA_DISABLE_AUTO_INSTR'] === 'true') {
    logger.info(
      'Not enabling automatic tracing as it is explicitly disabled via environment variable INSTANA_DISABLE_AUTO_INSTR.'
    );
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

  if (typeof config.tracing.activateImmediately === 'boolean') {
    return;
  }

  if (process.env['INSTANA_TRACE_IMMEDIATELY'] === 'true') {
    config.tracing.activateImmediately = true;
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
 * @param {InstanaConfig} config
 */
function normalizeTracingStackTraceLength(config) {
  if (config.tracing.stackTraceLength == null && process.env['INSTANA_STACK_TRACE_LENGTH']) {
    parseStringStackTraceLength(config, process.env['INSTANA_STACK_TRACE_LENGTH']);
  }
  if (config.tracing.stackTraceLength != null) {
    if (typeof config.tracing.stackTraceLength === 'number') {
      config.tracing.stackTraceLength = normalizeNumericalStackTraceLength(config.tracing.stackTraceLength);
    } else if (typeof config.tracing.stackTraceLength === 'string') {
      parseStringStackTraceLength(config, config.tracing.stackTraceLength);
    } else {
      logger.warn(
        `The value of config.tracing.stackTraceLength has the non-supported type ${typeof config.tracing
          .stackTraceLength} (the value is "${config.tracing.stackTraceLength}").` +
          `Assuming the default stack trace length ${defaults.tracing.stackTraceLength}.`
      );
      config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
    }
  } else {
    config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
  }
}

/**
 * @param {InstanaConfig} config
 * @param {string} value
 */
function parseStringStackTraceLength(config, value) {
  config.tracing.stackTraceLength = parseInt(value, 10);
  if (!isNaN(config.tracing.stackTraceLength)) {
    config.tracing.stackTraceLength = normalizeNumericalStackTraceLength(config.tracing.stackTraceLength);
  } else {
    logger.warn(
      `The value of config.tracing.stackTraceLength ("${value}") has type string and cannot be parsed to a numerical ` +
        `value. Assuming the default stack trace length ${defaults.tracing.stackTraceLength}.`
    );
    config.tracing.stackTraceLength = defaults.tracing.stackTraceLength;
  }
}

/**
 * @param {number} numericalLength
 * @returns {number}
 */
function normalizeNumericalStackTraceLength(numericalLength) {
  // just in case folks provide non-integral numbers or negative numbers
  const normalized = Math.abs(Math.round(numericalLength));
  if (normalized !== numericalLength) {
    logger.warn(
      `Normalized the provided value of config.tracing.stackTraceLength (${numericalLength}) to ${normalized}.`
    );
  }
  return normalized;
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
  if (config.tracing.spanBatchingEnabled != null) {
    if (typeof config.tracing.spanBatchingEnabled === 'boolean') {
      if (config.tracing.spanBatchingEnabled) {
        logger.info('Span batching is enabled via config.');
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

  if (process.env['INSTANA_SPANBATCHING_ENABLED'] === 'true') {
    logger.info('Span batching is enabled via environment variable INSTANA_SPANBATCHING_ENABLED.');
    config.tracing.spanBatchingEnabled = true;
    return;
  }

  config.tracing.spanBatchingEnabled = defaults.tracing.spanBatchingEnabled;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableW3cTraceCorrelation(config) {
  if (config.tracing.disableW3cTraceCorrelation === true) {
    logger.info('W3C trace correlation has been disabled via config.');
    return;
  }
  if (process.env['INSTANA_DISABLE_W3C_TRACE_CORRELATION']) {
    logger.info(
      'W3C trace correlation has been disabled via environment variable INSTANA_DISABLE_W3C_TRACE_CORRELATION.'
    );
    config.tracing.disableW3cTraceCorrelation = true;
    return;
  }

  config.tracing.disableW3cTraceCorrelation = defaults.tracing.disableW3cTraceCorrelation;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeTracingKafka(config) {
  config.tracing.kafka = config.tracing.kafka || {};

  if (config.tracing.kafka.traceCorrelation === false) {
    logger.info('Kafka trace correlation has been disabled via config.');
  } else if (
    process.env['INSTANA_KAFKA_TRACE_CORRELATION'] != null &&
    process.env['INSTANA_KAFKA_TRACE_CORRELATION'].toLowerCase() === 'false'
  ) {
    logger.info('Kafka trace correlation has been disabled via environment variable INSTANA_KAFKA_TRACE_CORRELATION.');
    config.tracing.kafka.traceCorrelation = false;
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

  config.secrets.matcherMode = config.secrets.matcherMode || fromEnvVar.matcherMode || defaults.secrets.matcherMode;
  config.secrets.keywords = config.secrets.keywords || fromEnvVar.keywords || defaults.secrets.keywords;

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
  let originalValue = configValue;
  if (configValue == null && envVarVal == null) {
    return defaultValue;
  } else if (configValue == null && envVarVal != null) {
    originalValue = envVarVal;
    configValue = parseInt(originalValue, 10);
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(
      `The value of ${configPath} (or ${envVarKey}) ("${originalValue}") is ' +
        'not numerical or cannot be parsed to a numerical value. Assuming the default value ${defaultValue}.`
    );
    return defaultValue;
  }
  return configValue;
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
    return;
  }
}

/**
 * @param {InstanaConfig} config
 */
function normalizeIgnoreEndpointsDisableSuppression(config) {
  if (process.env['INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION'] === 'true') {
    logger.info(
      'Disabling downstream suppression for ignoring endpoints feature as it is explicitly disabled via environment variable "INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION".'
    );
    config.tracing.ignoreEndpointsDisableSuppression = true;
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
    logger.info(
      'Disabling EOL events as it is explicitly disabled via environment variable "INSTANA_TRACING_DISABLE_EOL_EVENTS".'
    );
    config.tracing.disableEOLEvents = true;
    return;
  }

  config.tracing.disableEOLEvents = defaults.tracing.disableEOLEvents;
}
