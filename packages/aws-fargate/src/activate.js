/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger: serverlessLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');
const metrics = require('./metrics');
const { fullyQualifiedContainerId } = require('./metrics/container/containerUtil');
const { tracing, coreConfig, coreUtils } = instanaCore;

const instanaCtr = new instanaCore.InstanaCtr();

coreUtils.init(instanaCtr);
coreConfig.init(instanaCtr);
serverlessLogger.init(instanaCtr);

instanaCtr.set('utils', coreUtils.create());
instanaCtr.set('config', coreConfig.create());
instanaCtr.set('logger', serverlessLogger.create());

function init() {
  instanaCore.preInit(instanaCtr.config(), instanaCtr.utils());

  metrics.init(instanaCtr.config(), function onReady(err, ecsContainerPayload) {
    if (err) {
      instanaCtr.logger().error(
        `Initializing @instana/aws-fargate failed. This fargate task will not be monitored.
        ${err?.message} ${err?.stack}`
      );
      metrics.deactivate();
      return;
    }

    try {
      const taskArn = ecsContainerPayload && ecsContainerPayload.data ? ecsContainerPayload.data.taskArn : null;
      if (!taskArn) {
        instanaCtr
          .logger()
          .error(
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
        instanaCtr
          .logger()
          .error(
            'Initializing @instana/aws-fargate failed, the metadata did not have a container name. This fargate task ' +
              'will not be monitored.'
          );
        metrics.deactivate();
        return;
      }

      identityProvider.init(taskArn, containerId);

      backendConnector.init({
        config: instanaCtr.config(),
        identityProvider,
        defaultTimeout: 950
      });

      instanaCore.init(instanaCtr.config(), instanaCtr.utils(), backendConnector, identityProvider);
      metrics.activate(backendConnector);
      tracing.activate();

      instanaCtr.logger().debug('@instana/aws-fargate initialized.');

      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.aws-fargate.initialized');
    } catch (e) {
      instanaCtr
        .logger()
        .error(
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
  instanaCtr.logger().setLogger(_logger);
};

exports.opentracing = tracing.opentracing;
