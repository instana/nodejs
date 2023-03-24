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

/** @type {import('@instana/core/src/logger').GenericLogger} */
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
 * @property {boolean} [span-batching-enabled]
 */

/**
 * @typedef {Object} KafkaTracingConfig
 * @property {boolean} [trace-correlation]
 * @property {string} [header-format]
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
      logger.debug('Announce attempt failed: %s. Will retry in %s ms', err.message, retryDelay);
      setTimeout(tryToAnnounce, retryDelay, ctx, nextRetryDelay).unref();
      return;
    }

    let agentResponse;
    try {
      agentResponse = JSON.parse(rawResponse);
    } catch (e) {
      logger.warn(
        'Failed to JSON.parse agent response. Response was %s. Will retry in %s ms',
        rawResponse,
        retryDelay,
        e
      );
      setTimeout(tryToAnnounce, retryDelay, ctx, nextRetryDelay).unref();
      return;
    }

    const pid = agentResponse.pid;
    logger.info('Overwriting pid for reporting purposes to: %s', pid);
    pidStore.pid = pid;

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
}

/**
 * @param {AgentAnnounceResponse} agentResponse
 */
function applySecretsConfiguration(agentResponse) {
  if (agentResponse.secrets) {
    if (!(typeof agentResponse.secrets.matcher === 'string')) {
      logger.warn(
        'Received invalid secrets configuration from agent, attribute matcher is not a string: $s',
        agentResponse.secrets.matcher
      );
    } else if (Object.keys(secrets.matchers).indexOf(agentResponse.secrets.matcher) < 0) {
      logger.warn(
        'Received invalid secrets configuration from agent, matcher is not supported: $s',
        agentResponse.secrets.matcher
      );
    } else if (!Array.isArray(agentResponse.secrets.list)) {
      logger.warn(
        'Received invalid secrets configuration from agent, attribute list is not an array: $s',
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
          : tracingConstants.kafkaTraceCorrelationDefault,
      headerFormat:
        kafkaTracingConfigFromAgent['header-format'] != null
          ? kafkaTracingConfigFromAgent['header-format']
          : tracingConstants.kafkaHeaderFormatDefault
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
    logger.info('Enabling span batching via agent configuration.');
    ensureNestedObjectExists(agentOpts.config, ['tracing']);
    agentOpts.config.tracing.spanBatchingEnabled = true;
  }
}
