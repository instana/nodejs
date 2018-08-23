'use strict';

var logger = require('../logger').getLogger('tracing/transmission');
var agentConnection = require('../agentConnection');

var maxBufferedSpans;
var forceTransmissionStartingAt;
var isActive = false;

var spans = [];

var transmissionTimeoutHandle;


exports.init = function(config) {
  maxBufferedSpans = config.tracing.maxBufferedSpans || 1000;
  forceTransmissionStartingAt = config.tracing.forceTransmissionStartingAt || 500;
};


exports.activate = function() {
  isActive = true;
  spans = [];
  transmissionTimeoutHandle = setTimeout(transmitSpans, 1000);
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


exports.transmitImmediately = function(cb) {
  transmitSpans(cb);
};


function transmitSpans(cb) {
  clearTimeout(transmissionTimeoutHandle);

  if (spans.length === 0) {
    transmissionTimeoutHandle = setTimeout(transmitSpans, 1000);
    if (cb) {
      process.nextTick(function() {
        cb();
      });
    }
    return;
  }

  var spansToSend = spans;
  spans = [];

  agentConnection.sendSpansToAgent(spansToSend, function onSpansSendToAgent(error) {
    if (error) {
      logger.warn('Failed to transmit spans to agent', {error: error});
      spans = spans.concat(spansToSend);
      removeSpansIfNecessary();
    }

    transmissionTimeoutHandle = setTimeout(transmitSpans, 1000);
    if (cb) {
      cb(error);
    }
  });
}


function removeSpansIfNecessary() {
  if (spans.length > maxBufferedSpans) {
    spans = spans.slice(maxBufferedSpans - spans.length);
  }
}
