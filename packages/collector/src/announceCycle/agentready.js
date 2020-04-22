'use strict';

var clone = require('@instana/core').util.clone;
var compression = require('@instana/core').util.compression;
var tracing = require('@instana/core').tracing;
var autoprofile = require('@instana/autoprofile');

var agentOpts = require('../agent/opts');
var pidStore = require('../pidStore');
var metrics = require('../metrics');
var uncaught = require('../uncaught');

var logger;
logger = require('../logger').getLogger('announceCycle/agentready', function(newLogger) {
  logger = newLogger;
});
var requestHandler = require('../agent/requestHandler');
var agentConnection = require('../agentConnection');

var ctx;

var resendFullDataEveryXTransmissions = 300; /* about every 5 minutes */

var transmissionsSinceLastFullDataEmit = 0;
var previousTransmittedValue;

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
  transmissionsSinceLastFullDataEmit = 0;
  uncaught.activate();
  metrics.activate();
  tracing.activate();
  requestHandler.activate();
  sendData();
  scheduleTracingMetrics();

  if (agentOpts.autoProfile) {
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
  tracing.deactivate();
  requestHandler.deactivate();
  previousTransmittedValue = undefined;
  if (tracingMetricsTimeout) {
    clearTimeout(tracingMetricsTimeout);
    tracingMetricsTimeout = null;
  }
}

function sendData() {
  // clone retrieved objects to allow mutations in metric retrievers
  var newValueToTransmit = clone(metrics.gatherData());

  var payload;
  var isFullTransmission = transmissionsSinceLastFullDataEmit > resendFullDataEveryXTransmissions;
  if (isFullTransmission) {
    payload = newValueToTransmit;
  } else {
    payload = compression(previousTransmittedValue, newValueToTransmit);
  }

  agentConnection.sendDataToAgent(payload, onDataHasBeenSent.bind(null, isFullTransmission, newValueToTransmit));
}

function onDataHasBeenSent(isFullTransmission, transmittedValue, error, requests) {
  if (error) {
    logger.error('Error received while trying to send raw payload to agent: %s', error.message);
    ctx.transitionTo('unannounced');
    return;
  }
  previousTransmittedValue = transmittedValue;
  if (isFullTransmission) {
    transmissionsSinceLastFullDataEmit = 0;
  } else {
    transmissionsSinceLastFullDataEmit++;
  }
  requestHandler.handleRequests(requests);
  setTimeout(sendData, 1000).unref();
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
