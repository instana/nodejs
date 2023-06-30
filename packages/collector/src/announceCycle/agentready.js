/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

let isMainThread = true;
try {
  isMainThread = require('worker_threads').isMainThread;
} catch (err) {
  // Worker threads are not available, so we know that this is the main thread.
}

const { tracing } = require('@instana/core');

const agentConnection = require('../agentConnection');
const agentOpts = require('../agent/opts');
const initializedTooLate = require('../util/initializedTooLate');
const metrics = require('../metrics');
const pidStore = require('../pidStore');
const requestHandler = require('../agent/requestHandler');
const transmissionCycle = require('../metrics/transmissionCycle');
const uncaught = require('../uncaught');
const { isNodeVersionEOL } = require('../util/eol');

const ONE_MINUTE = 60 * 1000;
const EOL_EVENT_REFRESH_INTERVAL = 6 * 60 * ONE_MINUTE; // 6 hours
const EOL_EVENT_DURATION = 6 * 60 * ONE_MINUTE + ONE_MINUTE; // 6 hours + 1 minute

/** @type {*} */
let autoprofile;

/** @type {*} */
let profiler;

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('announceCycle/agentready', newLogger => {
  logger = newLogger;
});

if (agentOpts.autoProfile) {
  try {
    // @ts-ignore - TS cannot find @instana/profile. TODO: @instana/autoprofile is not linted or typed
    // eslint-disable-next-line import/no-extraneous-dependencies
    autoprofile = require('@instana/autoprofile');
  } catch (e) {
    logger.info(
      'Could not load @instana/autoprofile. You will not get profiling information for this Node.js app in Instana, ' +
        'although autoprofiling has been enabled. This typically occurs when native addons could not be built ' +
        'during module installation (npm install/yarn) or when npm install --no-optional or yarn --ignore-optional ' +
        'have been used to install dependencies. See the instructions to learn more about the requirements of the ' +
        'collector: ' +
        'https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#native-add-ons'
    );
    fireMonitoringEvent();
    setInterval(fireMonitoringEvent, 600000).unref();
  }
}

/** @type {import('./').AnnounceCycleContext} */
let ctx;

let tracingMetricsDelay = 1000;
if (typeof process.env.INSTANA_TRACER_METRICS_INTERVAL === 'string') {
  tracingMetricsDelay = parseInt(process.env.INSTANA_TRACER_METRICS_INTERVAL, 10);
  if (isNaN(tracingMetricsDelay) || tracingMetricsDelay <= 0) {
    tracingMetricsDelay = 1000;
  }
}

/** @type {NodeJS.Timeout} */
let tracingMetricsTimeout = null;

module.exports = exports = {
  enter,
  leave
};

/**
 * @param {import('./').AnnounceCycleContext} _ctx
 */
function enter(_ctx) {
  ctx = _ctx;

  initializedTooLate.check();

  if (isMainThread) {
    uncaught.activate();
    metrics.activate();
    requestHandler.activate();
    transmissionCycle.activate(
      metrics,
      agentConnection,
      /**
       * @param {Array.<import('../agent/requestHandler').AnnounceRequest>} requests
       */
      function onSuccess(requests) {
        requestHandler.handleRequests(requests);
      },
      function onError() {
        ctx.transitionTo('unannounced');
      }
    );
    scheduleTracingMetrics();
    detectEOLNodeVersion();
  }

  tracing.activate(agentOpts.config);

  if (agentOpts.autoProfile && autoprofile) {
    profiler = autoprofile.start();
    /**
     * @param {*} profiles
     * @param {(...args: *) => *} callback
     */
    profiler.sendProfiles = (profiles, callback) => {
      agentConnection.sendProfiles(profiles, callback);
    };
    profiler.getExternalPid = () => pidStore.pid;
    profiler.getLogger = () => logger;
    profiler.start();
  }

  logger.info('The Instana Node.js collector is now fully initialized and connected to the Instana host agent.');
}

function leave() {
  if (isMainThread) {
    uncaught.deactivate();
    metrics.deactivate();
    requestHandler.deactivate();
    transmissionCycle.deactivate();
    deScheduleTracingMetrics();
  }

  tracing.deactivate();

  if (profiler) {
    profiler.destroy();
    profiler = null;
  }
}

function sendTracingMetrics() {
  const payload = tracing._getAndResetTracingMetrics();
  agentConnection.sendTracingMetricsToAgent(payload, error => {
    if (error) {
      logger.info(
        'Error received while trying to send tracing metrics to agent: %s. This will not affect monitoring or tracing.',
        error.message
      );
      if (typeof error.message === 'string' && error.message.indexOf('Got status code 404')) {
        logger.info(
          'Apparently the version of the Instana host agent on this host does not support the POST /tracermetrics ' +
            'endpoint, will stop sending tracing metrics.'
        );
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

function deScheduleTracingMetrics() {
  if (tracingMetricsTimeout) {
    clearTimeout(tracingMetricsTimeout);
    tracingMetricsTimeout = null;
  }
}

function fireMonitoringEvent() {
  agentConnection.sendAgentMonitoringEvent('nodejs_collector_native_addon_autoprofile_missing', 'PROFILER', error => {
    if (error) {
      logger.error(
        'Error received while trying to send a monitoring event to the Instana host agent: %s',
        error.message
      );
    }
  });
}

function sendEOLEvent() {
  const pid = pidStore.getEntityId();
  agentConnection.sendEvent(
    {
      title: `Node.js version ${process.versions.node} reached its end of life`,
      text:
        'This version no longer receives updates or security fixes and might contain unfixed vulnerabilities.\n\n' +
        'Please consider upgrading Node.js to an active version.\n\n' +
        'For a list of active versions visit ' +
        '[https://nodejs.org/en/about/releases/](https://nodejs.org/en/about/releases/)',
      plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
      id: pid,
      timestamp: Date.now(),
      duration: EOL_EVENT_DURATION,
      severity: agentConnection.AgentEventSeverity.WARNING,
      path: `${agentOpts.agentUuid}/${pid}/nodejs-eol`
    },
    err => {
      if (err) {
        logger.debug('Sending a monitoring event for the Node.js version end-of-life check has failed.', err);
      }
    }
  );
}

/**
 * Sends an issue event to the agent when the Node.js version has reached end of life.
 * It will work for non-serverless environments where an agent is present.
 * (At the time of writing, the backend service that our serverless in-process collectors send data to does not have
 * support for events.)
 */
function detectEOLNodeVersion() {
  if (isNodeVersionEOL()) {
    setTimeout(() => {
      sendEOLEvent();
      setInterval(sendEOLEvent, EOL_EVENT_REFRESH_INTERVAL).unref();
    }, 2000);
  }
}
