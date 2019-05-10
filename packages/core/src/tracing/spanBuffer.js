'use strict';

var logger;
logger = require('../logger').getLogger('tracing/spanBuffer', function(newLogger) {
  logger = newLogger;
});

var downstreamConnection = null;
var maxBufferedSpans;
var forceTransmissionStartingAt;
var isActive = false;

var spans = [];

var transmissionTimeoutHandle;

exports.init = function(config, _downstreamConnection) {
  downstreamConnection = _downstreamConnection;
  maxBufferedSpans = config.tracing.maxBufferedSpans;
  forceTransmissionStartingAt = config.tracing.forceTransmissionStartingAt;
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
  spans = [];
  transmissionTimeoutHandle = setTimeout(transmitSpans, 1000);
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

  if (spans.length >= forceTransmissionStartingAt) {
    transmitSpans();
  }
};

function transmitSpans() {
  clearTimeout(transmissionTimeoutHandle);

  if (spans.length === 0) {
    transmissionTimeoutHandle = setTimeout(transmitSpans, 1000);
    transmissionTimeoutHandle.unref();
    return;
  }

  var spansToSend = spans;
  spans = [];

  downstreamConnection.sendSpans(spansToSend, function sendSpans(error) {
    if (error) {
      logger.warn('Failed to transmit spans', { error: error });
      spans = spans.concat(spansToSend);
      removeSpansIfNecessary();
    }

    transmissionTimeoutHandle = setTimeout(transmitSpans, 1000);
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
    spans = spans.slice(maxBufferedSpans - spans.length);
  }
}
