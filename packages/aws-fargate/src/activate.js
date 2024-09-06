/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');
const metrics = require('./metrics');
const { fullyQualifiedContainerId } = require('./metrics/container/containerUtil');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

let logger = consoleLogger;

const config = normalizeConfig({});
config.logger = logger;

function init() {
  // NOTE: We accept for `process.env.INSTANA_DEBUG` any string value - does not have to be "true".
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
      const taskArn = ecsContainerPayload && ecsContainerPayload.data ? ecsContainerPayload.data.taskArn : null;
      if (!taskArn) {
        logger.error(
          'Initializing @instana/aws-fargate failed, the metadata did not have a task ARN. This fargate task will ' +
            'not be monitored.'
        );
        metrics.deactivate();
        return;
      }
      const containerId = ecsContainerPayload.data.containerName
        ? fullyQualifiedContainerId(taskArn, ecsContainerPayload.data.containerName)
        : null;
      if (!containerId) {
        logger.error(
          'Initializing @instana/aws-fargate failed, the metadata did not have a container name. This fargate task ' +
            'will not be monitored.'
        );
        metrics.deactivate();
        return;
      }

      identityProvider.init(taskArn, containerId);
      backendConnector.init(identityProvider, logger, false, true, 950);
      instanaCore.init(config, backendConnector, identityProvider);
      metrics.activate(backendConnector);
      tracing.activate();

      logger.debug('@instana/aws-fargate initialized.');

      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.aws-fargate.initialized');
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
