/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger: serverlessLogger } = require('@instana/serverless');
const identityProvider = require('./identity_provider');

const { tracing, coreUtils, coreConfig } = instanaCore;
const customMetrics = require('./metrics');

const instanaCtr = new instanaCore.InstanaCtr();

coreUtils.init(instanaCtr);
coreConfig.init(instanaCtr);
serverlessLogger.init(instanaCtr);

instanaCtr.set('utils', coreUtils.create());
instanaCtr.set('config', coreConfig.create());
instanaCtr.set('logger', serverlessLogger.create());

async function init() {
  // NOTE: This package does not support autotracing.
  // NOTE: This package does not support metrics.

  try {
    // NOTE: We have to call pre-init because we are running an async call to get the service name.
    //       The goal is to register our instrumentations as early as possible.
    //       Otherwise we can easily run into errors e.g. from `hasThePackageBeenInitializedTooLate`.
    instanaCore.preInit(instanaCtr.config(), instanaCtr.utils());

    const serviceName = await customMetrics.name(instanaCtr.config());
    if (serviceName) {
      instanaCtr.config().serviceName = serviceName;
    }

    identityProvider.init();

    backendConnector.init({
      config: instanaCtr.config(),
      identityProvider,
      defaultTimeout: 950
    });

    instanaCore.init(instanaCtr.config(), instanaCtr.utils(), backendConnector, identityProvider);
    tracing.activate();

    instanaCtr.logger().info('@instana/serverless-collector initialized.');

    // eslint-disable-next-line no-unused-expressions
    process.send && process.send('instana.serverless-collector.initialized');
  } catch (e) {
    instanaCtr
      .logger()
      .error(
        `Initializing @instana/serverless-collector failed. This process will not be traced. ${e?.message} ${e?.stack}`
      );
  }
}

// NOTE: auto initialization is used because for all serverless environments
//       we recommend using the docker images. Therefor we need to auto initialize.
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
