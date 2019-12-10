'use strict';

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var logger;
logger = require('../../../logger').getLogger('tracing/kafkajs', function(newLogger) {
  logger = newLogger;
});

var isActive = false;

exports.init = function() {
  requireHook.onFileLoad(/\/kafkajs\/src\/producer\/messageProducer\.js/, instrumentProducer);
  requireHook.onFileLoad(/\/kafkajs\/src\/consumer\/runner\.js/, instrumentConsumer);
};

function instrumentProducer(createProducer) {
  if (typeof createProducer !== 'function') {
    return createProducer;
  }

  return function() {
    var producer = createProducer.apply(this, arguments);
    producer.send = shimmedSend(producer.send);
    producer.sendBatch = shimmedSendBatch(producer.sendBatch);
    return producer;
  };
}

function shimmedSend(originalSend) {
  // After dropping Node 4 support, we should make this an async function, since the original is also an async function.
  return /* async */ function(config /* { topic, messages } */) {
    var topic = config.topic;
    var messages = config.messages;

    if (cls.tracingSuppressed()) {
      addTraceLevelSuppressionToAllMessages(messages);
      return originalSend.apply(this, arguments);
    }
    if (!isActive || !cls.isTracing() || !messages || messages.length === 0) {
      return originalSend.apply(this, arguments);
    }
    var parentSpan = cls.getCurrentSpan();
    if (!parentSpan || constants.isExitSpan(parentSpan)) {
      return originalSend.apply(this, arguments);
    }
    var originalArgs = new Array(arguments.length);
    for (var argsIdx = 0; argsIdx < arguments.length; argsIdx++) {
      originalArgs[argsIdx] = arguments[argsIdx];
    }
    return instrumentedSend(this, originalSend, originalArgs, topic, messages);
  };
}

function instrumentedSend(ctx, originalSend, originalArgs, topic, messages) {
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('kafka', constants.EXIT);
    if (Array.isArray(messages)) {
      span.b = { s: messages.length };
      addTraceContextHeaderToAllMessages(messages, span);
    }
    span.stack = tracingUtil.getStackTrace(instrumentedSend);
    span.data.kafka = {
      service: topic,
      access: 'send'
    };

    return originalSend
      .apply(ctx, originalArgs)
      .then(function(result) {
        span.d = Date.now() - span.ts;
        span.transmit();
        return result;
      })
      .catch(function(error) {
        span.ec = 1;
        span.error = true;
        span.data.kafka.error = error.message;
        span.d = Date.now() - span.ts;
        span.transmit();
        throw error;
      });
  });
}

function shimmedSendBatch(originalSendBatch) {
  // After dropping Node 4 support, we should make this an async function, since the original is also an async function.
  return /* async */ function(config /* { topicMessages } */) {
    var topicMessages = config.topicMessages;

    if (cls.tracingSuppressed()) {
      topicMessages.forEach(function(topicMessage) {
        addTraceLevelSuppressionToAllMessages(topicMessage.messages);
      });
      return originalSendBatch.apply(this, arguments);
    }
    if (!isActive || !cls.isTracing() || !topicMessages || topicMessages.length === 0) {
      return originalSendBatch.apply(this, arguments);
    }
    var parentSpan = cls.getCurrentSpan();
    if (!parentSpan || constants.isExitSpan(parentSpan)) {
      return originalSendBatch.apply(this, arguments);
    }
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedSendBatch(this, originalSendBatch, originalArgs, topicMessages);
  };
}

function instrumentedSendBatch(ctx, originalSendBatch, originalArgs, topicMessages) {
  var topics = [];
  var messageCount = 0;
  topicMessages.forEach(function(topicMessage) {
    if (topicMessage.topic && topics.indexOf(topicMessage.topic) < 0) {
      topics.push(topicMessage.topic);
    }
    if (topicMessage.messages && Array.isArray(topicMessage.messages)) {
      messageCount += topicMessage.messages.length;
    }
  });

  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('kafka', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedSend);
    topicMessages.forEach(function(topicMessage) {
      addTraceContextHeaderToAllMessages(topicMessage.messages, span);
    });

    span.data.kafka = {
      service: topics.join(','),
      access: 'send'
    };
    if (messageCount > 0) {
      span.b = { s: messageCount };
    }

    return originalSendBatch
      .apply(ctx, originalArgs)
      .then(function(result) {
        span.d = Date.now() - span.ts;
        span.transmit();
        return result;
      })
      .catch(function(error) {
        span.ec = 1;
        span.error = true;
        span.data.kafka.error = error.message;
        span.d = Date.now() - span.ts;
        span.transmit();
        throw error;
      });
  });
}

function instrumentConsumer(Runner) {
  if (typeof Runner !== 'function') {
    return Runner;
  }
  return function() {
    // We need to convert the arguments to a proper array, otherwise the concat call would append them as one object,
    // effectively passing them on wrapped in an object.
    var args = Array.prototype.slice.call(arguments);

    var argObject = args[0];
    if (argObject && argObject.eachMessage) {
      // In kafkajs, eachMessage takes precedence and eachBatch is ignored if both eachMessage and eachBatch are
      // present.
      var originalEachMessage = argObject.eachMessage;
      argObject.eachMessage = instrumentedEachMessage(originalEachMessage);
    } else if (argObject && argObject.eachBatch) {
      var originalEachBatch = argObject.eachBatch;
      argObject.eachBatch = instrumentedEachBatch(originalEachBatch);
    }

    // We are patching a native ES6 constructor, the following approach works without relying on ES6 language features
    // (but see below for an easier alternative).
    return new (Function.prototype.bind.apply(Runner, [null].concat(Array.prototype.slice.call(arguments))))();

    // Once we drop support for Node.js 4, this could be simply:
    // return new Runner(...arguments);
    // See https://stackoverflow.com/a/33195176/2565264 and
    // https://node.green/#ES2015-syntax-spread-syntax-for-iterable-objects.
  };
}

function instrumentedEachMessage(originalEachMessage) {
  return /* async */ function(config /* { topic, message } */) {
    var topic = config.topic;
    var message = config.message;

    if (!isActive) {
      return originalEachMessage.apply(this, arguments);
    }
    var parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        'Cannot start a Kafka entry span when another span is already active. Currently, the following span is ' +
          'active: ' +
          JSON.stringify(parentSpan)
      );
      return originalEachMessage.apply(this, arguments);
    }

    var ctx = this;
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    var traceId;
    var parentSpanId;
    if (message && message.headers && message.headers[constants.kafkaTraceContextHeaderName]) {
      var traceContextBuffer = message.headers[constants.kafkaTraceContextHeaderName];
      if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
        var traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
        traceId = traceContext.t;
        parentSpanId = traceContext.s;
      }
    }

    return cls.ns.runAndReturn(function() {
      if (isSuppressed(message)) {
        cls.setTracingLevel('0');
        return originalEachMessage.apply(ctx, originalArgs);
      }

      var span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
      span.stack = [];
      span.data.kafka = {
        access: 'consume',
        service: topic
      };

      try {
        return originalEachMessage.apply(ctx, originalArgs);
      } finally {
        setImmediate(function() {
          span.d = Date.now() - span.ts;
          span.transmit();
        });
      }
    });
  };
}

function instrumentedEachBatch(originalEachBatch) {
  return /* async */ function(config /* { batch } */) {
    var batch = config.batch;
    if (!isActive) {
      return originalEachBatch.apply(this, arguments);
    }
    var parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        'Cannot start a Kafka entry span when another span is already active. Currently, the following span is ' +
          'active: ' +
          JSON.stringify(parentSpan)
      );
      return originalEachBatch.apply(this, arguments);
    }

    var ctx = this;
    var originalArgs = new Array(arguments.length);
    for (var argsIdx = 0; argsIdx < arguments.length; argsIdx++) {
      originalArgs[argsIdx] = arguments[argsIdx];
    }

    var traceId;
    var parentSpanId;
    if (batch.messages) {
      for (var msgIdx = 0; msgIdx < batch.messages.length; msgIdx++) {
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaTraceContextHeaderName]) {
          var traceContextBuffer = batch.messages[msgIdx].headers[constants.kafkaTraceContextHeaderName];
          if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
            var traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
            traceId = traceContext.t;
            parentSpanId = traceContext.s;
            break;
          }
        }
      }
    }

    return cls.ns.runAndReturn(function() {
      if (batch.messages && isSuppressed(batch.messages[0])) {
        cls.setTracingLevel('0');
        return originalEachBatch.apply(ctx, originalArgs);
      }

      var span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
      span.stack = [];
      span.data.kafka = {
        access: 'consume',
        service: batch ? batch.topic : undefined
      };

      if (batch && batch.messages) {
        span.b = { s: batch.messages.length };
      }

      try {
        return originalEachBatch.apply(ctx, originalArgs);
      } finally {
        setImmediate(function() {
          span.d = Date.now() - span.ts;
          span.transmit();
        });
      }
    });
  };
}

function isSuppressed(message) {
  if (message && message.headers && message.headers[constants.kafkaTraceLevelHeaderName]) {
    var traceLevelBuffer = message.headers[constants.kafkaTraceLevelHeaderName];
    return Buffer.isBuffer(traceLevelBuffer) && traceLevelBuffer.length >= 1 && traceLevelBuffer.readInt8() === 0;
  }
  return false;
}

function addTraceContextHeaderToAllMessages(messages, span) {
  if (Array.isArray(messages)) {
    for (var msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        // messages[msgIdx].headers = {
        //   [constants.kafkaTraceContextHeaderName]: tracingUtil.renderTraceContextToBuffer(span)
        //   [constants.kafkaTraceLevelHeaderName]: 1
        // };
        messages[msgIdx].headers = {};
        messages[msgIdx].headers[constants.kafkaTraceContextHeaderName] = tracingUtil.renderTraceContextToBuffer(span);
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName] = constants.kafkaTraceLevelValueInherit;
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceContextHeaderName] = tracingUtil.renderTraceContextToBuffer(span);
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName] = constants.kafkaTraceLevelValueInherit;
      }
    }
  }
}

function addTraceLevelSuppressionToAllMessages(messages) {
  if (Array.isArray(messages)) {
    for (var msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        // messages[msgIdx].headers = {
        //   [constants.kafkaTraceLevelHeaderName]: constants.kafkaTraceLevelValueSuppressed
        // };
        messages[msgIdx].headers = {};
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName] = constants.kafkaTraceLevelValueSuppressed;
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName] = constants.kafkaTraceLevelValueSuppressed;
      }
    }
  }
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
