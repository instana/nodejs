/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger: serverlessLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');
const metrics = require('./metrics');

const { tracing, coreUtils, coreConfig } = instanaCore;
const instanaCtr = new instanaCore.InstanaCtr();

coreUtils.init(instanaCtr);
coreConfig.init(instanaCtr);
serverlessLogger.init(instanaCtr);

instanaCtr.set('utils', coreUtils.create());
instanaCtr.set('config', coreConfig.create());
instanaCtr.set('logger', serverlessLogger.create());

function init() {
  if (!process.env.K_REVISION) {
    instanaCtr
      .logger()
      .error(
        'Initializing @instana/google-cloud-run failed. ' +
          'The environment variable K_REVISION is not set. This container ' +
          'instance will not be monitored.'
      );
    return;
  }

  instanaCore.preInit(instanaCtr.config(), instanaCtr.utils());

  metrics.init(instanaCtr.config(), function onReady(err, serviceRevisionPayload) {
    if (err) {
      instanaCtr.logger().error(
        `Initializing @instana/google-cloud-run failed. This container instance will not be monitored.
        Error: ${err?.message} ${err?.stack}`
      );
      metrics.deactivate();
      return;
    }

    const containerInstanceId =
      serviceRevisionPayload && serviceRevisionPayload.data ? serviceRevisionPayload.data.instanceId : null;
    if (!containerInstanceId) {
      instanaCtr
        .logger()
        .error(
          'Initializing @instana/google-cloud-run failed, the metadata did not have an instance ID. This Cloud Run ' +
            'container instance will not be monitored.'
        );
      metrics.deactivate();
      return;
    }

    try {
      identityProvider.init(containerInstanceId);

      backendConnector.init({
        config: instanaCtr.config(),
        identityProvider,
        defaultTimeout: 950
      });

      instanaCore.init(instanaCtr.config(), instanaCtr.utils(), backendConnector, identityProvider);
      metrics.activate(backendConnector);
      tracing.activate();

      instanaCtr.logger().debug('@instana/google-cloud-run initialized.');

      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.google-cloud-run.initialized');
    } catch (e) {
      instanaCtr.logger().error(
        `Initializing @instana/google-cloud-run failed. This Cloud Run container instance will not be monitored.
          ${e?.message} ${e?.stack}`
      );
    }
  });
}

init();

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

// NOTE: this is the external interface for the customer. They can set a custom logger.
exports.setLogger = function setLogger(_logger) {
  instanaCtr.logger().setLogger(_logger);
};

exports.opentracing = tracing.opentracing;
