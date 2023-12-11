/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger } = require('@instana/serverless');

const identityProvider = require('./identity_provider');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

let logger = consoleLogger;

const config = normalizeConfig({});

function init() {
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
    logger.setLevel(process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL);
  }
  // For more details about environment variables in azure, please see
  // https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings?tabs=kudu%2Cdotnet#app-environment
  if (!process.env.WEBSITE_OWNER_NAME && !process.env.WEBSITE_SITE_NAME && !process.env.WEBSITE_RESOURCE_GROUP) {
    logger.error(
      'Initializing @instana/azure-container-services failed. The environment variables' +
        `WEBSITE_OWNER_NAME: ${process.env.WEBSITE_OWNER_NAME} WEBSITE_SITE_NAME: ${process.env.WEBSITE_SITE_NAME} ` +
        `WEBSITE_RESOURCE_GROUP: ${process.env.WEBSITE_RESOURCE_GROUP} are not set. ` +
        'This container instance will not be monitored.'
    );
    return;
  }
  // In contrast to Fargate, the Azure Agent collects required metrics information from Azure APIs to oversee
  // services under Azure management. Therefore, our package is currently not fetching any metrics information.

  try {
    identityProvider.init();
    backendConnector.init(identityProvider, logger, false, true, 950);
    instanaCore.init(config, backendConnector, identityProvider);
    tracing.activate();
  } catch (e) {
    logger.error(
      'Initializing @instana/azure-container-services failed. This azure container service will not be monitored.',
      e
    );
  }
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
};

exports.opentracing = tracing.opentracing;
