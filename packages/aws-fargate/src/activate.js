'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');
const metrics = require('./metrics');
const { fullyQualifiedContainerId } = require('./metrics/container/containerUtil');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

let logger = consoleLogger;

let config = {};

// @instana/collector sends metric and span data every second. To reduce HTTP overhead we throttle this back:
// Metrics will be send every second, spans every 5 seconds.

if (!process.env.INSTANA_TRACING_TRANSMISSION_DELAY) {
  config.tracing = {
    transmissionDelay: 5000
  };
}

config = normalizeConfig(config);

function init() {
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
    logger.setLevel(process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL);
  }

  instanaCore.preInit();

  metrics.init(config, function onReady(err, ecsContainerPayload) {
    if (err) {
      logger.error('Initializing @instana/aws-fargate failed. This fargate task will not be monitored.', err);
      metrics.deactivate();
      return;
    }

    try {
      const taskArn = ecsContainerPayload.data.taskArn;
      const containerId = fullyQualifiedContainerId(taskArn, ecsContainerPayload.data.containerName);

      identityProvider.init(taskArn, containerId);
      backendConnector.init(identityProvider, logger, false, true, 950);
      instanaCore.init(config, backendConnector, identityProvider);
      metrics.activate(backendConnector);
      tracing.activate();
    } catch (e) {
      logger.error('Initializing @instana/aws-fargate failed. This fargate task will not be monitored.', e);
    }
  });
}

init();

// TODO create a util in serverless to add API exports to any object, use from here and aws-lambda
exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
  config.logger = logger;
  instanaCore.logger.init(config);
  metrics.setLogger(_logger);
};

exports.opentracing = tracing.opentracing;
