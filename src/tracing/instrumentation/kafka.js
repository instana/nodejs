'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var hook = require('../hook');

var isActive = false;

exports.init = function() {
  requireHook.on('kafka-node', instrument);
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
  var uid = hook.initAndPreSimulated();
  var tracingSuppressed = hook.isTracingSuppressed(uid);
  var args = [produceRequests];

  // bail early
  if (tracingSuppressed || hook.containsExitSpan(uid) || !produceRequests || produceRequests.length === 0) {
    // restore original send args
    if (cb) {
      args.push(cb);
    }
    return originalSend.apply(ctx, args);
  }

  hook.markAsExitSpan(uid);

  var produceRequest = produceRequests[0];

  var spanId = tracingUtil.generateRandomSpanId();
  var traceId = hook.getTraceId(uid);
  var parentId = undefined;
  if (!traceId) {
    traceId = spanId;
  } else {
    parentId = hook.getParentSpanId(uid);
  }

  var span = {
    s: spanId,
    t: traceId,
    p: parentId,
    f: tracingUtil.getFrom(),
    async: false,
    error: false,
    ec: 0,
    ts: Date.now(),
    d: 0,
    n: 'kafka',
    b: {
      s: produceRequests.length
    },
    stack: tracingUtil.getStackTrace(instrumentedSend),
    data: {
      kafka: {
        service: produceRequest.topic,
        access: 'send'
      }
    }
  };
  hook.setSpanId(uid, span.s);

  args.push(function onSendCompleted(err) {
    if (err) {
      span.ec = 1;
      span.error = true;
      span.data.kafka.error = err.message;
    }

    span.d = Date.now() - span.ts;
    transmission.addSpan(span);
    hook.postAndDestroySimulated(uid);

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

    var uid = hook.initAndPreSimulated();
    hook.setTracingSuppressed(uid, false);
    var spanId = tracingUtil.generateRandomSpanId();
    var span = {
      s: spanId,
      t: spanId,
      f: tracingUtil.getFrom(),
      async: false,
      error: false,
      ec: 0,
      ts: Date.now(),
      d: 0,
      n: 'kafka',
      stack: [],
      data: {
        kafka: {
          access: 'consume',
          service: message.topic
        }
      }
    };
    hook.setSpanId(uid, spanId);
    hook.setTraceId(uid, spanId);

    try {
      return original.apply(this, arguments);
    } finally {
      span.d = Date.now() - span.ts;
      transmission.addSpan(span);
      hook.postAndDestroySimulated(uid);
    }
  };
}


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
