/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');
const metrics = require('./metrics');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

let logger = consoleLogger;

const config = normalizeConfig({});
config.logger = logger;

function init() {
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
    logger.setLevel(process.env.INSTANA_DEBUG === 'true' ? 'debug' : process.env.INSTANA_LOG_LEVEL);
  }

  if (!process.env.K_REVISION) {
    logger.error(
      'Initializing @instana/google-cloud-run failed. The environment variable K_REVISION is not set. This container ' +
        'instance will not be monitored.'
    );
    return;
  }

  instanaCore.preInit();

  metrics.init(config, function onReady(err, serviceRevisionPayload) {
    if (err) {
      logger.error(
        'Initializing @instana/google-cloud-run failed. This container instance will not be monitored.',
        err
      );
      metrics.deactivate();
      return;
    }

    const containerInstanceId =
      serviceRevisionPayload && serviceRevisionPayload.data ? serviceRevisionPayload.data.instanceId : null;
    if (!containerInstanceId) {
      logger.error(
        'Initializing @instana/google-cloud-run failed, the metadata did not have an instance ID. This Cloud Run ' +
          'container instance will not be monitored.'
      );
      metrics.deactivate();
      return;
    }

    try {
      identityProvider.init(containerInstanceId);
      backendConnector.init(identityProvider, logger, false, true, 950);
      instanaCore.init(config, backendConnector, identityProvider);
      metrics.activate(backendConnector);
      tracing.activate();

      logger.debug('@instana/google-cloud-run initialized.');

      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.google-cloud-run.initialized');
    } catch (e) {
      logger.error(
        'Initializing @instana/google-cloud-run failed. This Cloud Run container instance will not be monitored.',
        e
      );
    }
  });
}

init();

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
