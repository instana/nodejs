'use strict';

var requireHook = require('../util/requireHook');
var logger = require('../logger').getLogger('metrics/healthchecks');

var timeBetweenHealthcheckCalls;
var healthy = 1;
var unhealthy = 0;

var adminPluginHealthcheck;
var timeoutHandle;

exports.payloadPrefix = 'healthchecks';
exports.currentPayload = {};

requireHook.onModuleLoad('admin-plugin-healthcheck', function onAdminPluginHealthcheckLoaded(_adminPluginHealthcheck) {
  adminPluginHealthcheck = _adminPluginHealthcheck;
});

exports.activate = function(config) {
  timeBetweenHealthcheckCalls = config.timeBetweenHealthcheckCalls || 3000;

  if (adminPluginHealthcheck != null) {
    gatherHealthcheckResults();
  }
};

function gatherHealthcheckResults() {
  adminPluginHealthcheck
    .getHealthCheckResult()
    .then(function onHealthcheckResults(adminHealthcheckResults) {
      var results = {};
      var previousResults = exports.currentPayload;

      // eslint-disable-next-line no-restricted-syntax
      for (var key in adminHealthcheckResults) {
        // eslint-disable-next-line no-prototype-builtins
        if (adminHealthcheckResults.hasOwnProperty(key)) {
          var result = adminHealthcheckResults[key];
          var checkHealthy = result.healthy ? healthy : unhealthy;
          var changed = previousResults[key] == null || previousResults[key].healthy !== checkHealthy;
          results[key] = {
            healthy: checkHealthy,
            since: changed ? new Date().getTime() : previousResults[key].since
          };
        }
      }

      exports.currentPayload = results;
      timeoutHandle = setTimeout(gatherHealthcheckResults, timeBetweenHealthcheckCalls);
    })
    .catch(function onHealthcheckResultFailure(err) {
      exports.currentPayload = {};
      logger.warn('Unexpected error while getting healthcheck results', err);
      timeoutHandle = setTimeout(gatherHealthcheckResults, timeBetweenHealthcheckCalls);
    });
}

exports.deactivate = function() {
  clearTimeout(timeoutHandle);
};
