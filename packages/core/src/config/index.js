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
 * Apply agent configuration to existing config with correct precedence.
 * Only applies agent config values if the current value is still at default.
 * Precedence: env vars > in-code config > agent config > defaults
 * (env vars and in-code config were already applied in normalize(), so we just check if value != default)
 *
 * @param {InstanaConfig} currentConfig - The current normalized config
 * @param {InstanaConfig} externalConfig - Configuration received from agent
 * @returns {InstanaConfig} - Updated config with agent values applied where appropriate
 */
module.exports.updateConfig = (currentConfig, externalConfig) => {
  if (!externalConfig || typeof externalConfig !== 'object') {
    return currentConfig;
  }

  // Apply agent tracing config if not already set
  if (externalConfig.tracing) {
    currentConfig.tracing = currentConfig.tracing || {};

    // Extra HTTP headers - only apply if current value is still default
    if (externalConfig.tracing.http && externalConfig.tracing.http.extraHttpHeadersToCapture) {
      currentConfig.tracing.http = currentConfig.tracing.http || {};
      const currentHeaders = currentConfig.tracing.http.extraHttpHeadersToCapture || [];
      const defaultHeaders = defaults.tracing.http.extraHttpHeadersToCapture || [];

      if (JSON.stringify(currentHeaders) === JSON.stringify(defaultHeaders)) {
        currentConfig.tracing.http.extraHttpHeadersToCapture = externalConfig.tracing.http.extraHttpHeadersToCapture;
      }
    }

    // Kafka trace correlation - only apply if current value is still default
    if (externalConfig.tracing.kafka && externalConfig.tracing.kafka.traceCorrelation !== undefined) {
      currentConfig.tracing.kafka = currentConfig.tracing.kafka || {};
      const currentValue = currentConfig.tracing.kafka.traceCorrelation;
      const defaultValue = defaults.tracing.kafka.traceCorrelation;

      if (currentValue === defaultValue) {
        currentConfig.tracing.kafka.traceCorrelation = externalConfig.tracing.kafka.traceCorrelation;
      }
    }

    // Span batching - only apply if current value is still default
    if (externalConfig.tracing.spanBatchingEnabled !== undefined) {
      const currentValue = currentConfig.tracing.spanBatchingEnabled;
      const defaultValue = defaults.tracing.spanBatchingEnabled;

      if (currentValue === defaultValue) {
        currentConfig.tracing.spanBatchingEnabled = externalConfig.tracing.spanBatchingEnabled;
      }
    }

    // Ignore endpoints - only apply if current value is still default (empty object)
    if (externalConfig.tracing.ignoreEndpoints) {
      const currentValue = currentConfig.tracing.ignoreEndpoints || {};
      const defaultValue = defaults.tracing.ignoreEndpoints || {};

      if (Object.keys(currentValue).length === Object.keys(defaultValue).length) {
        currentConfig.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.normalizeConfig(
          externalConfig.tracing.ignoreEndpoints
        );
      }
    }

    // Stack trace configuration
    if (externalConfig.tracing.global) {
      currentConfig.tracing.global = currentConfig.tracing.global || {};

      // Stack trace mode - only apply if current value is still default
      if (externalConfig.tracing.global.stackTrace !== undefined) {
        const currentValue = currentConfig.tracing.stackTrace;
        const defaultValue = defaults.tracing.stackTrace;

        if (currentValue === defaultValue) {
          const validation = validateStackTraceMode(externalConfig.tracing.global.stackTrace);
          if (validation.isValid) {
            const normalized = configNormalizers.stackTrace.normalizeStackTraceModeFromAgent(
              externalConfig.tracing.global.stackTrace
            );
            if (normalized !== null) {
              currentConfig.tracing.stackTrace = normalized;
            }
          }
        }
      }

      // Stack trace length - only apply if current value is still default
      if (externalConfig.tracing.global.stackTraceLength !== undefined) {
        const currentValue = currentConfig.tracing.stackTraceLength;
        const defaultValue = defaults.tracing.stackTraceLength;

        if (currentValue === defaultValue) {
          const validation = validateStackTraceLength(externalConfig.tracing.global.stackTraceLength);
          if (validation.isValid) {
            const normalized = configNormalizers.stackTrace.normalizeStackTraceLengthFromAgent(
              externalConfig.tracing.global.stackTraceLength
            );
            if (normalized !== null) {
              currentConfig.tracing.stackTraceLength = normalized;
            }
          }
        }
      }
    }

    // Disable instrumentations - only apply if current value is still default (empty object)
    if (externalConfig.tracing.disable) {
      const currentValue = currentConfig.tracing.disable || {};
      const defaultValue = defaults.tracing.disable || {};

      if (JSON.stringify(currentValue) === JSON.stringify(defaultValue)) {
        currentConfig.tracing.disable = configNormalizers.disable.normalizeExternalConfig({
          tracing: { disable: externalConfig.tracing.disable }
        });
      }
    }
  }

  return currentConfig;
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
    logger.info('Not enabling tracing as it is explicitly disabled via environment variable INSTANA_TRACING_DISABLE.');
    config.tracing.enabled = false;
    return;
  }

  if (config.tracing.enabled === false) {
    logger.info('Not enabling tracing as it is explicitly disabled via config.');
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
    config.tracing.allowRootExitSpan = true;
    return;
  }

  if (config.tracing.allowRootExitSpan === false) {
    return;
  }
  if (config.tracing.allowRootExitSpan === true) {
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
    config.tracing.useOpentelemetry = false;
    return;
  }

  if (config.tracing.useOpentelemetry === false) {
    return;
  }
  if (config.tracing.useOpentelemetry === true) {
    return;
  }

  config.tracing.useOpentelemetry = defaults.tracing.useOpentelemetry;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeAutomaticTracingEnabled(config) {
  if (!config.tracing.enabled) {
    logger.info('Not enabling automatic tracing as tracing in general is explicitly disabled.');
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

  if (config.tracing.automaticTracingEnabled === false) {
    logger.info('Not enabling automatic tracing as it is explicitly disabled via config.');
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
    config.tracing.activateImmediately = true;
    return;
  }

  if (typeof config.tracing.activateImmediately === 'boolean') {
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

  if (process.env.INSTANA_EXTRA_HTTP_HEADERS) {
    config.tracing.http.extraHttpHeadersToCapture = parseHeadersEnvVar(process.env.INSTANA_EXTRA_HTTP_HEADERS);
    return;
  }

  if (config.tracing.http.extraHttpHeadersToCapture) {
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
      s => s.toLowerCase() // Node.js HTTP API turns all incoming HTTP headers into lowercase.
    );
    return;
  }

  config.tracing.http.extraHttpHeadersToCapture = defaults.tracing.http.extraHttpHeadersToCapture;
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
    logger.info('Span batching is enabled via environment variable INSTANA_SPANBATCHING_ENABLED.');
    config.tracing.spanBatchingEnabled = true;
    return;
  }

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

  config.tracing.spanBatchingEnabled = defaults.tracing.spanBatchingEnabled;
}

/**
 * @param {InstanaConfig} config
 */
function normalizeDisableW3cTraceCorrelation(config) {
  if (process.env['INSTANA_DISABLE_W3C_TRACE_CORRELATION']) {
    logger.info(
      'W3C trace correlation has been disabled via environment variable INSTANA_DISABLE_W3C_TRACE_CORRELATION.'
    );
    config.tracing.disableW3cTraceCorrelation = true;
    return;
  }

  if (config.tracing.disableW3cTraceCorrelation === true) {
    logger.info('W3C trace correlation has been disabled via config.');
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
    logger.info('Kafka trace correlation has been disabled via environment variable INSTANA_KAFKA_TRACE_CORRELATION.');
    config.tracing.kafka.traceCorrelation = false;
  } else if (config.tracing.kafka.traceCorrelation === false) {
    logger.info('Kafka trace correlation has been disabled via config.');
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
    logger.debug(`Ignore endpoints have been configured: ${JSON.stringify(config.tracing.ignoreEndpoints)}`);
    return;
  }

  // Case 2: Load from the `INSTANA_IGNORE_ENDPOINTS` environment variable
  // Introduced in Phase 1 for basic filtering based only on operations (e.g., `redis.get`, `kafka.consume`).
  if (process.env.INSTANA_IGNORE_ENDPOINTS) {
    config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.fromEnv(process.env.INSTANA_IGNORE_ENDPOINTS);
    logger.debug(`Ignore endpoints have been configured: ${JSON.stringify(config.tracing.ignoreEndpoints)}`);
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
    logger.info(
      'Disabling downstream suppression for ignoring endpoints feature as it is explicitly disabled via environment variable "INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION".'
    );
    config.tracing.ignoreEndpointsDisableSuppression = true;
    return;
  }

  if (config.tracing.ignoreEndpointsDisableSuppression === true) {
    logger.info(
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
    logger.info(
      'Disabling EOL events as it is explicitly disabled via environment variable "INSTANA_TRACING_DISABLE_EOL_EVENTS".'
    );
    config.tracing.disableEOLEvents = true;
    return;
  }

  if (config.tracing.disableEOLEvents === true) {
    logger.info('Disabling EOL events as it is explicitly disabled via config.');
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
