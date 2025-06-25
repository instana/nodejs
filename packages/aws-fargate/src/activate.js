/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger: log } = require('@instana/serverless');

const identityProvider = require('./identity_provider');
const metrics = require('./metrics');
const { fullyQualifiedContainerId } = require('./metrics/container/containerUtil');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

const logger = log.init();
const config = normalizeConfig({}, logger);

function init() {
  instanaCore.preInit(config);

  metrics.init(config, function onReady(err, ecsContainerPayload) {
    if (err) {
      logger.error(
        `Initializing @instana/aws-fargate failed. This fargate task will not be monitored. 
        ${err?.message} ${err?.stack}`
      );
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

      backendConnector.init({
        config,
        identityProvider,
        stopSendingOnFailure: false,
        defaultTimeout: 950
      });

      instanaCore.init(config, backendConnector, identityProvider);
      metrics.activate(backendConnector);
      tracing.activate();

      logger.debug('@instana/aws-fargate initialized.');

      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.aws-fargate.initialized');
    } catch (e) {
      logger.error(
        `Initializing @instana/aws-fargate failed. This fargate task will not be monitored. ${e?.message} ${e?.stack}`
      );
    }
  });
}

init();

// TODO create a util in serverless to add API exports to any object, use from here and aws-lambda
exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

// NOTE: this is the external interface for the customer. They can set a custom logger.
exports.setLogger = function setLogger(_logger) {
  log.init({ logger: _logger });
};

exports.opentracing = tracing.opentracing;
