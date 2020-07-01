'use strict';

var semver = require('semver');
var instanaCore = require('@instana/core');

var transmissionCycle = require('../metrics/transmissionCycle');
var agentOpts = require('../agent/opts');
var pidStore = require('../pidStore');
var metrics = require('../metrics');
var initializedTooLate = require('../util/initializedTooLate');
var uncaught = require('../uncaught');

var autoprofile;
var tracing = instanaCore.tracing;

var logger;
logger = require('../logger').getLogger('announceCycle/agentready', function(newLogger) {
  logger = newLogger;
});

if (agentOpts.autoProfile && semver.gte(process.version, '6.4.0')) {
  try {
    autoprofile = require('@instana/autoprofile');
  } catch (e) {
    logger.info(
      'Could not load @instana/autoprofile. You will not get profiling information for this Node.js app in Instana, ' +
        'although autoprofiling has been enabled. This typically occurs when native addons could not be installed ' +
        'during module installation (npm install/yarn). See the instructions to learn more about the requirements of ' +
        'the collector: ' +
        'https://www.instana.com/docs/ecosystem/node-js/installation/#native-addons'
    );
  }
}

var requestHandler = require('../agent/requestHandler');
var agentConnection = require('../agentConnection');

var ctx;

var tracingMetricsDelay = 1000;
if (typeof process.env.INSTANA_TRACER_METRICS_INTERVAL === 'string') {
  tracingMetricsDelay = parseInt(process.env.INSTANA_TRACER_METRICS_INTERVAL, 10);
  if (isNaN(tracingMetricsDelay) || tracingMetricsDelay <= 0) {
    tracingMetricsDelay = 1000;
  }
}
var tracingMetricsTimeout = null;

module.exports = exports = {
  enter: enter,
  leave: leave
};

function enter(_ctx) {
  ctx = _ctx;
  uncaught.activate();
  metrics.activate();
  initializedTooLate.check();
  transmissionCycle.activate(
    metrics,
    agentConnection,
    function onSuccess(requests) {
      requestHandler.handleRequests(requests);
    },
    function onError() {
      ctx.transitionTo('unannounced');
    }
  );
  tracing.activate();
  requestHandler.activate();
  scheduleTracingMetrics();

  if (agentOpts.autoProfile && autoprofile) {
    var profiler = autoprofile.start();
    profiler.sendProfiles = function(profiles, callback) {
      agentConnection.sendProfiles(profiles, callback);
    };
    profiler.getExternalPid = function() {
      return pidStore.pid;
    };
    profiler.getLogger = function() {
      return logger;
    };
    profiler.start();
  }

  logger.info('The Instana Node.js collector is now fully initialized.');
}

function leave() {
  uncaught.deactivate();
  metrics.deactivate();
  transmissionCycle.deactivate();
  tracing.deactivate();
  requestHandler.deactivate();
  if (tracingMetricsTimeout) {
    clearTimeout(tracingMetricsTimeout);
    tracingMetricsTimeout = null;
  }
}

function sendTracingMetrics() {
  var payload = tracing._getAndResetTracingMetrics();
  agentConnection.sendTracingMetricsToAgent(payload, function(error) {
    if (error) {
      logger.warn('Error received while trying to send tracing metrics to agent: %s', error.message);
      if (typeof error.message === 'string' && error.message.indexOf('Got status code 404')) {
        logger.warn('Apparently the agent does not support POST /tracermetrics, will stop sending tracing metrics.');
        return;
      }
    }
    scheduleTracingMetrics();
  });
}

function scheduleTracingMetrics() {
  tracingMetricsTimeout = setTimeout(sendTracingMetrics, tracingMetricsDelay);
  tracingMetricsTimeout.unref();
}
