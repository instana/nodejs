'use strict';

var tracingMetrics = require('./metrics');

var logger;
logger = require('../logger').getLogger('tracing/spanBuffer', function(newLogger) {
  logger = newLogger;
});

var downstreamConnection = null;
var isActive = false;
var activatedAt = null;

var minDelayBeforeSendingSpans;
if (process.env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS != null) {
  minDelayBeforeSendingSpans = parseInt(process.env.INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS, 10);
  if (isNaN(minDelayBeforeSendingSpans)) {
    minDelayBeforeSendingSpans = 1000;
  }
} else {
  minDelayBeforeSendingSpans = 1000;
}
var initialDelayBeforeSendingSpans;
var transmissionDelay;
var maxBufferedSpans;
var forceTransmissionStartingAt;

var spans = [];

var transmissionTimeoutHandle;

exports.init = function(config, _downstreamConnection) {
  downstreamConnection = _downstreamConnection;
  maxBufferedSpans = config.tracing.maxBufferedSpans;
  forceTransmissionStartingAt = config.tracing.forceTransmissionStartingAt;
  transmissionDelay = config.tracing.transmissionDelay;
  initialDelayBeforeSendingSpans = Math.max(transmissionDelay, minDelayBeforeSendingSpans);
};

exports.activate = function() {
  if (!downstreamConnection) {
    logger.error('No downstreamConnection has been set.');
    return;
  }
  if (!downstreamConnection.sendSpans) {
    logger.error('Configured downstreamConnection has no attribute "sendSpans".');
    return;
  }
  if (typeof downstreamConnection.sendSpans !== 'function') {
    logger.error('downstreamConnection.sendSpans is not a function.');
    return;
  }
  isActive = true;
  if (activatedAt == null) {
    // record the time stamp of the first activation to enforce one second delay between sending snapshot data and
    // sending spans for the first time.
    activatedAt = Date.now();
  }
  spans = [];
  transmissionTimeoutHandle = setTimeout(transmitSpans, initialDelayBeforeSendingSpans);
  transmissionTimeoutHandle.unref();
};

exports.deactivate = function() {
  isActive = false;
  spans = [];
  clearTimeout(transmissionTimeoutHandle);
};

exports.addSpan = function(span) {
  if (!isActive) {
    return;
  }

  if (span.t == null) {
    logger.warn('Span of type %s has no trace ID. Not transmitting this span', span.n);
    return;
  }
  spans.push(span);

  if (spans.length >= forceTransmissionStartingAt && Date.now() - minDelayBeforeSendingSpans > activatedAt) {
    transmitSpans();
  }
};

function transmitSpans() {
  clearTimeout(transmissionTimeoutHandle);

  if (spans.length === 0) {
    transmissionTimeoutHandle = setTimeout(transmitSpans, transmissionDelay);
    transmissionTimeoutHandle.unref();
    return;
  }

  var spansToSend = spans;
  spans = [];

  downstreamConnection.sendSpans(spansToSend, function sendSpans(error) {
    if (error) {
      logger.warn('Failed to transmit spans, will retry in ' + transmissionDelay + ' ms.', error.message);
      spans = spans.concat(spansToSend);
      removeSpansIfNecessary();
    }

    transmissionTimeoutHandle = setTimeout(transmitSpans, transmissionDelay);
    transmissionTimeoutHandle.unref();
  });
}

/**
 * Synchronously returns the spans that are scheduled for transmission and resets the internal span buffer to an empty
 * array.
 */
exports.getAndResetSpans = function getAndResetSpans() {
  var spansToSend = spans;
  spans = [];
  return spansToSend;
};

function removeSpansIfNecessary() {
  if (spans.length > maxBufferedSpans) {
    var droppedCount = spans.length - maxBufferedSpans;
    logger.warn('Span buffer is over capacity, dropping ' + droppedCount + ' spans.');
    tracingMetrics.incrementDropped(spans.length - maxBufferedSpans);
    // retain the last maxBufferedSpans elements, drop everything before that
    spans = spans.slice(-maxBufferedSpans);
  }
}
