'use strict';

var clone = require('@instana/core').util.clone;
var compression = require('@instana/core').util.compression;
var tracing = require('@instana/core').tracing;

var metrics = require('../metrics');
var uncaught = require('../uncaught');

var logger;
logger = require('../logger').getLogger('announceCycle/agentready', function(newLogger) {
  logger = newLogger;
});
var requestHandler = require('../agent/requestHandler');
var agentConnection = require('../agentConnection');

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
  enter: function(ctx) {
    transmissionsSinceLastFullDataEmit = 0;

    uncaught.activate();
    metrics.activate();
    tracing.activate();
    requestHandler.activate();
    sendData();
    scheduleTracingMetrics();
    logger.info('The Instana Node.js collector is now fully initialized.');

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

      agentConnection.sendDataToAgent(payload, function(error, requests) {
        if (error) {
          logger.error('Error received while trying to send raw payload to agent: %s', error.message);
          ctx.transitionTo('unannounced');
          return;
        }
        previousTransmittedValue = newValueToTransmit;
        if (isFullTransmission) {
          transmissionsSinceLastFullDataEmit = 0;
        } else {
          transmissionsSinceLastFullDataEmit++;
        }
        requestHandler.handleRequests(requests);
        setTimeout(sendData, 1000).unref();
      });
    }

    function scheduleTracingMetrics() {
      tracingMetricsTimeout = setTimeout(sendTracingMetrics, tracingMetricsDelay);
      tracingMetricsTimeout.unref();
    }

    function sendTracingMetrics() {
      var payload = tracing._getAndResetTracingMetrics();
      agentConnection.sendTracingMetricsToAgent(payload, function(error) {
        if (error) {
          logger.warn('Error received while trying to send tracing metrics to agent: %s', error.message);
          if (typeof error.message === 'string' && error.message.indexOf('Got status code 404')) {
            logger.warn(
              'Apparently the agent does not support POST /tracermetrics, will stop sending tracing metrics.'
            );
            return;
          }
        }
        scheduleTracingMetrics();
      });
    }
  },

  leave: function() {
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
};
