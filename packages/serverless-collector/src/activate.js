/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');
const identityProvider = require('./identity_provider');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

let logger = consoleLogger;

const config = normalizeConfig({});
config.logger = logger;

// NOTE:
// The service name will be "localhost" because the serverless collector does not support
// metrics. Metrics contain the package.json name. AFAIK there is currently
// no way to connect metrics with spans for **agentless non serverless** environments.
// https://jsw.ibm.com/browse/INSTA-3607
const getServiceName = (conf, callback) => {
  if (process.env.INSTANA_SERVICE_NAME) {
    return callback(process.env.INSTANA_SERVICE_NAME);
  }

  instanaCore.util.applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule(conf, (err, packageJson) => {
    if (err) {
      logger.debug('Failed to determine main package.json.', err);
      return callback();
    }

    logger.debug(`Found main package.json: ${packageJson.name}`);
    callback(packageJson.name);
  });
};

function init() {
  // NOTE: We accept for `process.env.INSTANA_DEBUG` any string value - does not have to be "true".
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
    logger.setLevel(process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL);
  }

  // NOTE: This package does not support autotracing.
  // NOTE: This package does not support metrics.

  try {
    // NOTE: We have to call pre-init because we are running an async call to get the service name.
    //       The goal is to register our instrumentations as early as possible.
    //       Otherwise we can easily run into errors e.g. from `hasThePackageBeenInitializedTooLate`.
    instanaCore.preInit();

    getServiceName(config, serviceName => {
      if (serviceName) {
        config.serviceName = serviceName;
      }

      identityProvider.init();
      backendConnector.init(identityProvider, logger, false, true, 950);
      instanaCore.init(config, backendConnector, identityProvider);
      tracing.activate();

      logger.debug('@instana/serverless-collector initialized.');

      // eslint-disable-next-line no-unused-expressions
      process.send && process.send('instana.serverless-collector.initialized');
    });
  } catch (e) {
    logger.error('Initializing @instana/serverless-collector failed. This process will not be traced.', e);
  }
}

// NOTE: auto initialization is used because for all serverless environments
//       we recommend using the docker images. Therefor we need to auto initialize.
init();

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
  config.logger = logger;
  instanaCore.logger.init(config);
};

exports.opentracing = tracing.opentracing;
