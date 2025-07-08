/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const instanaCore = require('@instana/core');
const { backendConnector, consoleLogger: log } = require('@instana/serverless');

const identityProvider = require('./identity_provider');

const { tracing, util: coreUtil } = instanaCore;
const { normalizeConfig } = coreUtil;

const logger = log.init();
const config = normalizeConfig({}, logger);

function init() {
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

    backendConnector.init({
      config,
      identityProvider,
      defaultTimeout: 950
    });

    instanaCore.init(config, backendConnector, identityProvider);
    tracing.activate();

    logger.debug('@instana/azure-container-services initialized.');

    // eslint-disable-next-line no-unused-expressions
    process.send && process.send('instana.azure-app-service.initialized');
  } catch (e) {
    logger.error(
      'Initializing @instana/azure-container-services failed. This azure container service will not be monitored.' +
        `${e?.message} ${e?.stack}`
    );
  }
}

init();

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

// NOTE: this is the external interface for the customer. They can set a custom logger.
exports.setLogger = function setLogger(_logger) {
  log.init({ logger: _logger });
};

exports.opentracing = tracing.opentracing;
