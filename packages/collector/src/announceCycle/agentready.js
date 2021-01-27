/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const semver = require('semver');
const instanaCore = require('@instana/core');

const agentConnection = require('../agentConnection');
const agentOpts = require('../agent/opts');
const initializedTooLate = require('../util/initializedTooLate');
const metrics = require('../metrics');
const pidStore = require('../pidStore');
const requestHandler = require('../agent/requestHandler');
const transmissionCycle = require('../metrics/transmissionCycle');
const uncaught = require('../uncaught');

let autoprofile;
const tracing = instanaCore.tracing;

let logger;
logger = require('../logger').getLogger('announceCycle/agentready', newLogger => {
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
    fireMonitoringEvent();
    setInterval(fireMonitoringEvent, 600000).unref();
  }
}

let ctx;

let tracingMetricsDelay = 1000;
if (typeof process.env.INSTANA_TRACER_METRICS_INTERVAL === 'string') {
  tracingMetricsDelay = parseInt(process.env.INSTANA_TRACER_METRICS_INTERVAL, 10);
  if (isNaN(tracingMetricsDelay) || tracingMetricsDelay <= 0) {
    tracingMetricsDelay = 1000;
  }
}
let tracingMetricsTimeout = null;

module.exports = exports = {
  enter,
  leave
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
    const profiler = autoprofile.start();
    profiler.sendProfiles = (profiles, callback) => {
      agentConnection.sendProfiles(profiles, callback);
    };
    profiler.getExternalPid = () => pidStore.pid;
    profiler.getLogger = () => logger;
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
  const payload = tracing._getAndResetTracingMetrics();
  agentConnection.sendTracingMetricsToAgent(payload, error => {
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

function fireMonitoringEvent() {
  agentConnection.sendAgentMonitoringEvent('nodejs_collector_native_addon_autoprofile_missing', 'PROFILER', error => {
    if (error) {
      logger.error('Error received while trying to send Agent Monitoring Event to agent: %s', error.message);
    }
  });
}
