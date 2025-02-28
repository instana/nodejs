/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const {
  secrets,
  tracing,
  util: { ensureNestedObjectExists, normalizeConfig }
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
 * @property {import('@instana/core/src/util/normalizeConfig').MatchingOption} matcher
 */

/**
 * @typedef {Object} TracingConfig
 * @property {Array.<string>} [extra-http-headers]
 * @property {KafkaTracingConfig} [kafka]
 * @property {Object.<string, (string | string[])| IgnoreEndpointConfig[]>} [ignore-endpoints]
 * @property {boolean} [span-batching-enabled]
 */

/**
 * @typedef {Object} KafkaTracingConfig
 * @property {boolean} [trace-correlation]
 */

/**
 * @typedef {Object} IgnoreEndpointConfig
 * @property {string | string[]} method - A method or list of methods to ignore.
 * @property {string[]=} [endpoints] - A list of endpoints to ignore (optional).
 */

/**
 * @param {import('@instana/core/src/util/normalizeConfig').InstanaConfig} config
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
 * The agent configuration can include an array of strings or objects with additional filtering criteria.
 * For more information, see the related design discussion:
 * https://github.ibm.com/instana/requests-for-discussion/pull/84
 *
 * The 'ignore-endpoints' configuration follows this structure:
 *
 * - Keys represent service names (e.g., 'kafka', 'redis').
 * - Values can be:
 *   - An array of strings specifying methods to ignore (e.g., ["type", "get"]).
 *   - An array of `IgnoreEndpointConfig` objects, each defining a method and endpoints.
 *
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyIgnoreEndpointsConfiguration(agentResponse) {
  try {
    if (agentResponse?.tracing?.['ignore-endpoints']) {
      ensureNestedObjectExists(agentOpts.config, ['tracing', 'ignoreEndpoints']);
      agentOpts.config.tracing.ignoreEndpoints = normalizeConfig.normalizeIgnoreEndpointsConfigFromYaml(
        agentResponse?.tracing?.['ignore-endpoints']
      );
    }
  } catch (error) {
    logger.warn(
      `Error processing ignore-endpoints configuration:${agentResponse.tracing['ignore-endpoints']}`,
      error?.message
    );
    ensureNestedObjectExists(agentOpts.config, ['tracing', 'ignoreEndpoints']);
    agentOpts.config.tracing.ignoreEndpoints = {};
  }
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
