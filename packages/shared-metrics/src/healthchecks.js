/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const { requireHook } = require('@instana/core').util;

let logger = require('@instana/core').logger.getLogger('metrics');

/**
 * @param {import('@instana/core/src/logger').GenericLogger} _logger
 */
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

/** @type {number} */
let timeBetweenHealthcheckCalls;
const healthy = 1;
const unhealthy = 0;

/** @type {*} */
let adminPluginHealthcheck;
/** @type {NodeJS.Timeout} */
let timeoutHandle;

exports.payloadPrefix = 'healthchecks';
// @ts-ignore
exports.currentPayload = {};

requireHook.onModuleLoad(
  'admin-plugin-healthcheck',
  function onAdminPluginHealthcheckLoaded(/** @type {*} */ _adminPluginHealthcheck) {
    adminPluginHealthcheck = _adminPluginHealthcheck;
  }
);

/**
 * @param {import('@instana/core/src/util/normalizeConfig').InstanaConfig} config
 */
exports.activate = function activate(config) {
  timeBetweenHealthcheckCalls = config.metrics.timeBetweenHealthcheckCalls;

  if (adminPluginHealthcheck != null) {
    gatherHealthcheckResults();
  }
};

function gatherHealthcheckResults() {
  adminPluginHealthcheck
    .getHealthCheckResult()
    .then(function onHealthcheckResults(/** @type{*} */ adminHealthcheckResults) {
      /** @type {Object.<string, *>} */
      const results = {};
      /** @type {Object.<string, *>} */
      const previousResults = exports.currentPayload;

      // eslint-disable-next-line no-restricted-syntax
      for (const key in adminHealthcheckResults) {
        // eslint-disable-next-line no-prototype-builtins
        if (adminHealthcheckResults.hasOwnProperty(key)) {
          const result = adminHealthcheckResults[key];
          const checkHealthy = result.healthy ? healthy : unhealthy;
          const changed = previousResults[key] == null || previousResults[key].healthy !== checkHealthy;
          results[key] = {
            healthy: checkHealthy,
            since: changed ? new Date().getTime() : previousResults[key].since
          };
        }
      }

      // @ts-ignore
      exports.currentPayload = results;
      timeoutHandle = setTimeout(gatherHealthcheckResults, timeBetweenHealthcheckCalls);
      timeoutHandle.unref();
    })
    .catch(function onHealthcheckResultFailure(/** @type {*} */ err) {
      // @ts-ignore
      exports.currentPayload = {};
      logger.warn('Unexpected error while getting healthcheck results', err);
      timeoutHandle = setTimeout(gatherHealthcheckResults, timeBetweenHealthcheckCalls);
      timeoutHandle.unref();
    });
}

exports.deactivate = function deactivate() {
  clearTimeout(timeoutHandle);
};
