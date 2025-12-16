/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const {
  secrets,
  tracing,
  util: { ensureNestedObjectExists },
  coreConfig: { configNormalizers }
} = require('@instana/core');
const { constants: tracingConstants } = tracing;

const agentConnection = require('../agentConnection');
const agentOpts = require('../agent/opts');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;
/** @type {{ pid: number }} */
let pidStore;

const initialRetryDelay = 10 * 1000; // 10 seconds
const backoffFactor = 1.5;
const maxRetryDelay = 60 * 1000; // one minute

/**
 * @typedef {Object} AgentAnnounceResponse
 * @property {SecretsConfig} [secrets]
 * @property {TracingConfig} [tracing]
 * @property {Array.<string>} [extraHeaders]
 * @property {boolean|string} [spanBatchingEnabled]
 */

/**
 * @typedef {Object} SecretsConfig
 * @property {Array.<string>} list
 * @property {import('@instana/core/src/config').MatchingOption} matcher
 */

/**
 * @typedef {Object} TracingConfig
 * @property {Array.<string>} [extra-http-headers]
 * @property {KafkaTracingConfig} [kafka]
 * @property {import('@instana/core/src/config/types').IgnoreEndpoints} [ignore-endpoints]
 * @property {boolean} [span-batching-enabled]
 * @property {import('@instana/core/src/config/types').Disable} [disable]
 * @property {StackTraceConfig} [global]
 */

/**
 * @typedef {Object} StackTraceConfig
 * @property {string} [stack-trace] - Stack trace mode ('error'|'all'|'none'|)
 * @property {number} [stack-trace-length] - Maximum number of stack trace frames to capture
 */

/**
 * @typedef {Object} KafkaTracingConfig
 * @property {boolean} [trace-correlation]
 */

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 * @param {any} _pidStore
 */
function init(config, _pidStore) {
  logger = config.logger;
  pidStore = _pidStore;
}

/**
 * @param {import('./').AnnounceCycleContext} ctx
 * @param {number} retryDelay
 */
function tryToAnnounce(ctx, retryDelay = initialRetryDelay) {
  /** @type {number} */
  let nextRetryDelay;
  if (retryDelay * backoffFactor >= maxRetryDelay) {
    nextRetryDelay = maxRetryDelay;
  } else {
    nextRetryDelay = retryDelay * backoffFactor;
  }
  agentConnection.announceNodeCollector((err, rawResponse) => {
    if (err) {
      logger.info(
        `Establishing the connection to the Instana host agent has failed: ${err?.message}. ` +
          'This usually means that the Instana host agent is not yet ready to accept connections.' +
          `This is not an error. Establishing the connection will be retried in ${retryDelay} ms.`
      );
      setTimeout(tryToAnnounce, retryDelay, ctx, nextRetryDelay).unref();
      return;
    }

    let agentResponse;
    try {
      agentResponse = JSON.parse(rawResponse);
    } catch (e) {
      logger.error(
        "Failed to parse the JSON payload from the Instana host agent's response. Establishing the connection" +
          `to the Instana host agent will be retried in ${retryDelay} ms. The response payload was ${rawResponse}.` +
          `${e?.message} ${e?.stack}`
      );
      setTimeout(tryToAnnounce, retryDelay, ctx, nextRetryDelay).unref();
      return;
    }

    if (pidStore.pid !== agentResponse.pid) {
      logger.info(
        `Reporting data to the Instana host agent with the PID from the root namespace (${agentResponse.pid}) ` +
          `instead of the in-container PID (${pidStore.pid}).`
      );
      pidStore.pid = agentResponse.pid;
    }

    agentOpts.agentUuid = agentResponse.agentUuid;
    applyAgentConfiguration(agentResponse);
    ctx.transitionTo('announced');
  });
}

/**
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyAgentConfiguration(agentResponse) {
  applySecretsConfiguration(agentResponse);
  applyExtraHttpHeaderConfiguration(agentResponse);
  applyKafkaTracingConfiguration(agentResponse);
  applySpanBatchingConfiguration(agentResponse);
  applyIgnoreEndpointsConfiguration(agentResponse);
  applyStackTraceConfiguration(agentResponse);
  applyDisableConfiguration(agentResponse);
}

/**
 * @param {AgentAnnounceResponse} agentResponse
 */
function applySecretsConfiguration(agentResponse) {
  if (agentResponse.secrets) {
    if (!(typeof agentResponse.secrets.matcher === 'string')) {
      logger.warn(
        `Received an invalid secrets configuration from the Instana host agent, attribute matcher is not a string:
          ${agentResponse.secrets.matcher}`
      );
    } else if (Object.keys(secrets.matchers).indexOf(agentResponse.secrets.matcher) < 0) {
      logger.warn(
        `Received an invalid secrets configuration from the Intana agent, matcher is not supported:
          ${agentResponse.secrets.matcher}`
      );
    } else if (!Array.isArray(agentResponse.secrets.list)) {
      logger.warn(
        `Received an invalid secrets configuration from the Instana host agent, attribute list is not an array:
          ${agentResponse.secrets.list}`
      );
    } else {
      secrets.setMatcher(agentResponse.secrets.matcher, agentResponse.secrets.list);
    }
  }
}

/**
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyExtraHttpHeaderConfiguration(agentResponse) {
  if (agentResponse.tracing) {
    actuallyApplyExtraHttpHeaderConfiguration(agentResponse.tracing['extra-http-headers']);
    return;
  }

  // Fallback for Node.js discovery prior to version 1.2.18, which did not support providing the complete
  // com.instana.tracing section in the agent response. We can remove this legacy fallback approximately in May 2023.
  actuallyApplyExtraHttpHeaderConfiguration(agentResponse.extraHeaders);
}

/**
 * @param {Array.<string>} extraHeaders
 */
function actuallyApplyExtraHttpHeaderConfiguration(extraHeaders) {
  if (Array.isArray(extraHeaders)) {
    ensureNestedObjectExists(agentOpts.config, ['tracing', 'http']);
    // The Node.js HTTP API converts all incoming HTTP headers into lowercase.
    agentOpts.config.tracing.http.extraHttpHeadersToCapture = extraHeaders.map((/** @type {string} */ s) =>
      s.toLowerCase()
    );
  }
}

/**
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyKafkaTracingConfiguration(agentResponse) {
  if (agentResponse.tracing && agentResponse.tracing.kafka) {
    const kafkaTracingConfigFromAgent = agentResponse.tracing.kafka;
    const kafkaTracingConfig = {
      traceCorrelation:
        kafkaTracingConfigFromAgent['trace-correlation'] != null
          ? kafkaTracingConfigFromAgent['trace-correlation']
          : tracingConstants.kafkaTraceCorrelationDefault
    };
    ensureNestedObjectExists(agentOpts.config, ['tracing', 'kafka']);
    agentOpts.config.tracing.kafka = kafkaTracingConfig;
  }
  // There is no fallback because there is are no legacy agent response attributes for the Kafka tracing config, those
  // were only introduced with the Node.js discovery version 1.2.18.
}

/**
 * @param {AgentAnnounceResponse} agentResponse
 */
function applySpanBatchingConfiguration(agentResponse) {
  if (agentResponse.tracing) {
    if (agentResponse.tracing['span-batching-enabled'] === true) {
      ensureNestedObjectExists(agentOpts.config, ['tracing']);
      agentOpts.config.tracing.spanBatchingEnabled = true;
    }
    return;
  }

  // Fallback for Node.js discovery prior to version 1.2.18, which did not sent the span-batching-enabled config in the
  // common tracing options section. We can remove this legacy fallback approximately in May 2023.
  if (agentResponse.spanBatchingEnabled === true || agentResponse.spanBatchingEnabled === 'true') {
    logger.info('Enabling span batching via Instana host agent configuration.');
    ensureNestedObjectExists(agentOpts.config, ['tracing']);
    agentOpts.config.tracing.spanBatchingEnabled = true;
  }
}

/**
 * The incoming agent configuration may include strings, an array of strings, or objects
 * that define filtering criteria.
 *
 * - Phase 1: Introduced simple filtering based on operations (e.g. redis.get).
 *    For more information see: https://github.ibm.com/instana/requests-for-discussion/pull/84
 *
 * - Phase 2: Added advanced filtering with 'methods' and 'endpoints'.
 *    For more inormation see: https://github.ibm.com/instana/technical-documentation/pull/333
 *
 * The normalized internal format is:
 *   { [serviceName: string]: [{ methods: string[], endpoints: string[] }] }
 *
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyIgnoreEndpointsConfiguration(agentResponse) {
  const ignoreEndpointsConfig = agentResponse?.tracing?.['ignore-endpoints'];
  if (!ignoreEndpointsConfig) return;

  ensureNestedObjectExists(agentOpts.config, ['tracing', 'ignoreEndpoints']);
  agentOpts.config.tracing.ignoreEndpoints = configNormalizers.ignoreEndpoints.normalizeConfig(ignoreEndpointsConfig);
}

/**
 * Apply global stack trace configuration from the agent response.
 *
 * Configuration structure:
 * {
 *   tracing: {
 *     global: {
 *       "stack-trace": "error",
 *       "stack-trace-length": 10
 *     }
 *   }
 * }
 *
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyStackTraceConfiguration(agentResponse) {
  const globalConfig = agentResponse?.tracing?.global;
  if (!globalConfig) return;

  ensureNestedObjectExists(agentOpts.config, ['tracing']);

  // Apply stack-trace mode configuration if provided
  if (globalConfig['stack-trace'] != null) {
    agentOpts.config.tracing.stackTrace = globalConfig['stack-trace'];
    logger.info(`Applied global stack trace mode configuration: ${globalConfig['stack-trace']}`);
  }

  // Apply stack-trace-length configuration if provided
  if (globalConfig['stack-trace-length'] != null) {
    const rawValue = globalConfig['stack-trace-length'];
    let stackTraceLength;

    if (typeof rawValue === 'number') {
      stackTraceLength = rawValue;
    } else if (typeof rawValue === 'string') {
      stackTraceLength = parseInt(rawValue, 10);
    }

    if (stackTraceLength != null && !isNaN(stackTraceLength)) {
      agentOpts.config.tracing.stackTraceLength = stackTraceLength;
      logger.info(`Applied global stack trace length configuration: ${stackTraceLength}`);
    } else {
      logger.warn(`Invalid stack-trace-length value: ${rawValue}. Expected a number or numeric string.`);
    }
  }
}

/**
 * The incoming agent configuration include  `disable` object that include
 * which instrumentation/categories should be disabled. For example: { logging: true, console: false }
 * This will be normalized into an array of strings, such as: ['logging', '!console']
 * For more details on the design, refer to:https://github.ibm.com/instana/technical-documentation/pull/344
 *
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyDisableConfiguration(agentResponse) {
  const disablingConfig = agentResponse?.tracing?.disable;
  if (!disablingConfig) return;

  ensureNestedObjectExists(agentOpts.config, ['tracing', 'disable']);
  agentOpts.config.tracing.disable = configNormalizers.disable.normalizeExternalConfig({
    tracing: { disable: disablingConfig }
  });
}
module.exports = {
  init,

  /**
   * @param {import('./').AnnounceCycleContext} ctx
   */
  enter: function (ctx) {
    tryToAnnounce(ctx);
  },

  leave: function () {}
};
