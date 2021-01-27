/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const requireHook = require('@instana/core').util.requireHook;

let logger = require('@instana/core').logger.getLogger('metrics');
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

let timeBetweenHealthcheckCalls;
const healthy = 1;
const unhealthy = 0;

let adminPluginHealthcheck;
let timeoutHandle;

exports.payloadPrefix = 'healthchecks';
exports.currentPayload = {};

requireHook.onModuleLoad('admin-plugin-healthcheck', function onAdminPluginHealthcheckLoaded(_adminPluginHealthcheck) {
  adminPluginHealthcheck = _adminPluginHealthcheck;
});

exports.activate = function activate(config) {
  timeBetweenHealthcheckCalls = config.metrics.timeBetweenHealthcheckCalls;

  if (adminPluginHealthcheck != null) {
    gatherHealthcheckResults();
  }
};

function gatherHealthcheckResults() {
  adminPluginHealthcheck
    .getHealthCheckResult()
    .then(function onHealthcheckResults(adminHealthcheckResults) {
      const results = {};
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

      exports.currentPayload = results;
      timeoutHandle = setTimeout(gatherHealthcheckResults, timeBetweenHealthcheckCalls);
      timeoutHandle.unref();
    })
    .catch(function onHealthcheckResultFailure(err) {
      exports.currentPayload = {};
      logger.warn('Unexpected error while getting healthcheck results', err);
      timeoutHandle = setTimeout(gatherHealthcheckResults, timeBetweenHealthcheckCalls);
      timeoutHandle.unref();
    });
}

exports.deactivate = function deactivate() {
  clearTimeout(timeoutHandle);
};
