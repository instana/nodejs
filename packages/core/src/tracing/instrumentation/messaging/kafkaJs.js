/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let logger;
logger = require('../../../logger').getLogger('tracing/kafkajs', newLogger => {
  logger = newLogger;
});

let isActive = false;

exports.init = function init() {
  requireHook.onFileLoad(/\/kafkajs\/src\/producer\/messageProducer\.js/, instrumentProducer);
  requireHook.onFileLoad(/\/kafkajs\/src\/consumer\/runner\.js/, instrumentConsumer);
};

function instrumentProducer(createProducer) {
  if (typeof createProducer !== 'function') {
    return createProducer;
  }

  return function () {
    const producer = createProducer.apply(this, arguments);
    producer.send = shimmedSend(producer.send);
    producer.sendBatch = shimmedSendBatch(producer.sendBatch);
    return producer;
  };
}

function shimmedSend(originalSend) {
  // After dropping Node 4 support, we should make this an async function, since the original is also an async function.
  return /* async */ function (config /* { topic, messages } */) {
    const topic = config.topic;
    const messages = config.messages;

    if (cls.tracingSuppressed()) {
      addTraceLevelSuppressionToAllMessages(messages);
      return originalSend.apply(this, arguments);
    }
    if (!isActive || !cls.isTracing() || !messages || messages.length === 0) {
      return originalSend.apply(this, arguments);
    }
    const parentSpan = cls.getCurrentSpan();
    if (!parentSpan || constants.isExitSpan(parentSpan)) {
      return originalSend.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let argsIdx = 0; argsIdx < arguments.length; argsIdx++) {
      originalArgs[argsIdx] = arguments[argsIdx];
    }
    return instrumentedSend(this, originalSend, originalArgs, topic, messages);
  };
}

function instrumentedSend(ctx, originalSend, originalArgs, topic, messages) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('kafka', constants.EXIT);
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
      .then(result => {
        span.d = Date.now() - span.ts;
        span.transmit();
        return result;
      })
      .catch(error => {
        span.ec = 1;
        span.data.kafka.error = error.message;
        span.d = Date.now() - span.ts;
        span.transmit();
        throw error;
      });
  });
}

function shimmedSendBatch(originalSendBatch) {
  // After dropping Node 4 support, we should make this an async function, since the original is also an async function.
  return /* async */ function (config /* { topicMessages } */) {
    const topicMessages = config.topicMessages;

    if (cls.tracingSuppressed()) {
      topicMessages.forEach(topicMessage => {
        addTraceLevelSuppressionToAllMessages(topicMessage.messages);
      });
      return originalSendBatch.apply(this, arguments);
    }
    if (!isActive || !cls.isTracing() || !topicMessages || topicMessages.length === 0) {
      return originalSendBatch.apply(this, arguments);
    }
    const parentSpan = cls.getCurrentSpan();
    if (!parentSpan || constants.isExitSpan(parentSpan)) {
      return originalSendBatch.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedSendBatch(this, originalSendBatch, originalArgs, topicMessages);
  };
}

function instrumentedSendBatch(ctx, originalSendBatch, originalArgs, topicMessages) {
  const topics = [];
  let messageCount = 0;
  topicMessages.forEach(topicMessage => {
    if (topicMessage.topic && topics.indexOf(topicMessage.topic) < 0) {
      topics.push(topicMessage.topic);
    }
    if (topicMessage.messages && Array.isArray(topicMessage.messages)) {
      messageCount += topicMessage.messages.length;
    }
  });

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('kafka', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedSend);
    topicMessages.forEach(topicMessage => {
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
      .then(result => {
        span.d = Date.now() - span.ts;
        span.transmit();
        return result;
      })
      .catch(error => {
        span.ec = 1;
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
  return function () {
    // We need to convert the arguments to a proper array, otherwise the concat call would append them as one object,
    // effectively passing them on wrapped in an object.
    const args = Array.prototype.slice.call(arguments);

    const argObject = args[0];
    if (argObject && argObject.eachMessage) {
      // In kafkajs, eachMessage takes precedence and eachBatch is ignored if both eachMessage and eachBatch are
      // present.
      const originalEachMessage = argObject.eachMessage;
      argObject.eachMessage = instrumentedEachMessage(originalEachMessage);
    } else if (argObject && argObject.eachBatch) {
      const originalEachBatch = argObject.eachBatch;
      argObject.eachBatch = instrumentedEachBatch(originalEachBatch);
    }
    return new Runner(...arguments);
  };
}

function instrumentedEachMessage(originalEachMessage) {
  return /* async */ function (config /* { topic, message } */) {
    const topic = config.topic;
    const message = config.message;

    if (!isActive) {
      return originalEachMessage.apply(this, arguments);
    }
    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start a Kafka entry span when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return originalEachMessage.apply(this, arguments);
    }

    const ctx = this;
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    let traceId;
    let parentSpanId;
    if (message && message.headers && message.headers[constants.kafkaTraceContextHeaderName]) {
      const traceContextBuffer = message.headers[constants.kafkaTraceContextHeaderName];
      if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
        const traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
        traceId = traceContext.t;
        parentSpanId = traceContext.s;
      }
    }

    return cls.ns.runAndReturn(() => {
      if (isSuppressed(message)) {
        cls.setTracingLevel('0');
        return originalEachMessage.apply(ctx, originalArgs);
      }

      const span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
      span.stack = [];
      span.data.kafka = {
        access: 'consume',
        service: topic
      };

      try {
        return originalEachMessage.apply(ctx, originalArgs);
      } finally {
        setImmediate(() => {
          span.d = Date.now() - span.ts;
          span.transmit();
        });
      }
    });
  };
}

function instrumentedEachBatch(originalEachBatch) {
  return /* async */ function (config /* { batch } */) {
    const batch = config.batch;
    if (!isActive) {
      return originalEachBatch.apply(this, arguments);
    }
    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start a Kafka entry span when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return originalEachBatch.apply(this, arguments);
    }

    const ctx = this;
    const originalArgs = new Array(arguments.length);
    for (let argsIdx = 0; argsIdx < arguments.length; argsIdx++) {
      originalArgs[argsIdx] = arguments[argsIdx];
    }

    let traceId;
    let parentSpanId;
    if (batch.messages) {
      for (let msgIdx = 0; msgIdx < batch.messages.length; msgIdx++) {
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaTraceContextHeaderName]) {
          const traceContextBuffer = batch.messages[msgIdx].headers[constants.kafkaTraceContextHeaderName];
          if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
            const traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
            traceId = traceContext.t;
            parentSpanId = traceContext.s;
            break;
          }
        }
      }
    }

    return cls.ns.runAndReturn(() => {
      if (batch.messages && isSuppressed(batch.messages[0])) {
        cls.setTracingLevel('0');
        return originalEachBatch.apply(ctx, originalArgs);
      }

      const span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
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
        setImmediate(() => {
          span.d = Date.now() - span.ts;
          span.transmit();
        });
      }
    });
  };
}

function isSuppressed(message) {
  if (message && message.headers && message.headers[constants.kafkaTraceLevelHeaderName]) {
    const traceLevelBuffer = message.headers[constants.kafkaTraceLevelHeaderName];
    return Buffer.isBuffer(traceLevelBuffer) && traceLevelBuffer.length >= 1 && traceLevelBuffer.readInt8() === 0;
  }
  return false;
}

function addTraceContextHeaderToAllMessages(messages, span) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
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
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
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

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
