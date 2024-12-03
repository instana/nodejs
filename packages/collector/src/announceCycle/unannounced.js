/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const {
  secrets,
  tracing,
  util: { ensureNestedObjectExists }
} = require('@instana/core');
const { constants: tracingConstants } = tracing;

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;
logger = require('../logger').getLogger('announceCycle/unannounced', newLogger => {
  logger = newLogger;
});
const agentConnection = require('../agentConnection');
const agentOpts = require('../agent/opts');
const pidStore = require('../pidStore');

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
 * @property {import('@instana/core/src/secrets').MatchingOptions} matcher
 */

/**
 * @typedef {Object} TracingConfig
 * @property {Array.<string>} [extra-http-headers]
 * @property {KafkaTracingConfig} [kafka]
 * @property {Object.<string, (string | string[])>} [ignore-endpoints]
 * @property {boolean} [span-batching-enabled]
 */

/**
 * @typedef {Object} KafkaTracingConfig
 * @property {boolean} [trace-correlation]
 */

module.exports = {
  /**
   * @param {import('./').AnnounceCycleContext} ctx
   */
  enter: function (ctx) {
    tryToAnnounce(ctx);
  },

  leave: function () {}
};

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
        'Establishing the connection to the Instana host agent has failed: %s. This usually means that the Instana ' +
          'host agent is not yet ready to accept connections. This is not an error. Establishing the connection will ' +
          'be retried in %s ms.',
        err.message,
        retryDelay
      );
      setTimeout(tryToAnnounce, retryDelay, ctx, nextRetryDelay).unref();
      return;
    }

    let agentResponse;
    try {
      agentResponse = JSON.parse(rawResponse);
    } catch (e) {
      logger.error(
        "Failed to parse the JSON payload from the Instana host agent's response. Establishing the " +
          'connection to the Instana host agent will be retried in %s ms. The response payload was %s.',
        retryDelay,
        rawResponse,
        e
      );
      setTimeout(tryToAnnounce, retryDelay, ctx, nextRetryDelay).unref();
      return;
    }

    if (pidStore.pid !== agentResponse.pid) {
      logger.info(
        'Reporting data to the Instana host agent with the PID from the root namespace (%s) instead of the ' +
          'in-container PID (%s).',
        agentResponse.pid,
        pidStore.pid
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
        'Received an invalid secrets configuration from the Instana host agent, attribute matcher is not a string: $s',
        agentResponse.secrets.matcher
      );
    } else if (Object.keys(secrets.matchers).indexOf(agentResponse.secrets.matcher) < 0) {
      logger.warn(
        'Received an invalid secrets configuration from the Intana agent, matcher is not supported: $s',
        agentResponse.secrets.matcher
      );
    } else if (!Array.isArray(agentResponse.secrets.list)) {
      logger.warn(
        'Received an invalid secrets configuration from the Instana host agent, attribute list is not an array: $s',
        agentResponse.secrets.list
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
 * - The agent configuration currently uses a pipe ('|') as a separator for endpoints.
 * - This function supports both ('|') and comma (',') to ensure future compatibility.
 * - Additionally, it supports the `string[]` format for backward compatibility,
 *   as this was the previously used standard. The final design decision is not yet completed.
 *   https://github.ibm.com/instana/requests-for-discussion/pull/84
 *
 * @param {AgentAnnounceResponse} agentResponse
 */
function applyIgnoreEndpointsConfiguration(agentResponse) {
  if (agentResponse?.tracing?.['ignore-endpoints']) {
    const endpointTracingConfigFromAgent = agentResponse.tracing['ignore-endpoints'];

    const endpointTracingConfig = Object.fromEntries(
      Object.entries(endpointTracingConfigFromAgent).map(([service, endpoints]) => {
        let normalizedEndpoints = null;
        if (typeof endpoints === 'string') {
          normalizedEndpoints = endpoints.split(/[|,]/).map(endpoint => endpoint?.trim()?.toLowerCase());
        } else if (Array.isArray(endpoints)) {
          normalizedEndpoints = endpoints.map(endpoint => endpoint?.toLowerCase());
        }

        return [service.toLowerCase(), normalizedEndpoints];
      })
    );

    ensureNestedObjectExists(agentOpts.config, ['tracing', 'ignoreEndpoints']);
    agentOpts.config.tracing.ignoreEndpoints = endpointTracingConfig;
  }
}
