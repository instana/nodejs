'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('kafka-node', instrument);
};

function instrument(kafka) {
  shimmer.wrap(Object.getPrototypeOf(kafka.Producer.prototype), 'send', shimSend);
  shimmer.wrap(kafka.Consumer.prototype, 'emit', shimEmit);
  shimmer.wrap(kafka.HighLevelConsumer.prototype, 'emit', shimEmit);
}

function shimSend(original) {
  return function() {
    if (isActive) {
      return instrumentedSend(this, original, arguments[0], arguments[1]);
    }
    return original.apply(this, arguments);
  };
}

function instrumentedSend(ctx, originalSend, produceRequests, cb) {
  var parentSpan = cls.getCurrentSpan();
  var args = [produceRequests];

  // Possibly bail early
  if (!cls.isTracing() || cls.isExitSpan(parentSpan) || !produceRequests || produceRequests.length === 0) {
    // restore original send args
    if (cb) {
      args.push(cb);
    }
    return originalSend.apply(ctx, args);
  }

  var produceRequest = produceRequests[0];

  var span = cls.startSpan('kafka', cls.EXIT);
  span.b = { s: produceRequests.length };
  span.stack = tracingUtil.getStackTrace(instrumentedSend);
  span.data = {
    kafka: {
      service: produceRequest.topic,
      access: 'send'
    }
  };

  args.push(function onSendCompleted(err) {
    if (err) {
      span.ec = 1;
      span.error = true;
      span.data.kafka.error = err.message;
    }

    span.d = Date.now() - span.ts;
    span.transmit();

    if (cb) {
      return cb.apply(this, arguments);
    }
  });
  return originalSend.apply(ctx, args);
}

function shimEmit(original) {
  return function(eventType, message) {
    if (!isActive || eventType !== 'message') {
      return original.apply(this, arguments);
    }

    var originalThis = this;
    var originalArgs = arguments;

    cls.ns.runAndReturn(function() {
      var span = cls.startSpan('kafka', cls.ENTRY);
      span.stack = [];
      span.data = {
        kafka: {
          access: 'consume',
          service: message.topic
        }
      };

      try {
        return original.apply(originalThis, originalArgs);
      } finally {
        span.d = Date.now() - span.ts;
        span.transmit();
      }
    });
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
