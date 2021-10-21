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

let traceCorrelationEnabled = true;
// Before we start phase 1 of the migration, 'binary' will be the default value. With phase 1, we will move to 'both',
// with phase 2 it will no longer be configurable and will always use 'string'.
let headerFormat = 'binary';

let isActive = false;

exports.init = function init(config) {
  requireHook.onFileLoad(/\/kafkajs\/src\/producer\/messageProducer\.js/, instrumentProducer);
  requireHook.onFileLoad(/\/kafkajs\/src\/consumer\/runner\.js/, instrumentConsumer);
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
  headerFormat = config.tracing.kafka.headerFormat;
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
    let level;
    if (message && message.headers) {
      // Look for the the newer string header format first.
      if (message.headers[constants.kafkaTraceIdHeaderNameString]) {
        traceId = String(message.headers[constants.kafkaTraceIdHeaderNameString]);
      }
      if (message.headers[constants.kafkaSpanIdHeaderNameString]) {
        parentSpanId = String(message.headers[constants.kafkaSpanIdHeaderNameString]);
      }
      if (message.headers[constants.kafkaTraceLevelHeaderNameString]) {
        level = String(message.headers[constants.kafkaTraceLevelHeaderNameString]);
      }
      // Only fall back to legacy binary trace correlation headers if no new header is present.
      if (traceId == null && parentSpanId == null && level == null) {
        // The newer string header format has not been found, fall back to legacy binary headers.
        if (message.headers[constants.kafkaTraceContextHeaderNameBinary]) {
          const traceContextBuffer = message.headers[constants.kafkaTraceContextHeaderNameBinary];
          if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
            const traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
            traceId = traceContext.t;
            parentSpanId = traceContext.s;
          }
        }
        level = readTraceLevelBinary(message);
      }
    }

    return cls.ns.runAndReturn(() => {
      if (isSuppressed(level)) {
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
    let level;
    if (batch.messages) {
      // Look for the the newer string header format first.
      for (let msgIdx = 0; msgIdx < batch.messages.length; msgIdx++) {
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaTraceIdHeaderNameString]) {
          traceId = String(batch.messages[msgIdx].headers[constants.kafkaTraceIdHeaderNameString]);
        }
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaSpanIdHeaderNameString]) {
          parentSpanId = String(batch.messages[msgIdx].headers[constants.kafkaSpanIdHeaderNameString]);
        }
        if (
          batch.messages[msgIdx].headers &&
          batch.messages[msgIdx].headers[constants.kafkaTraceLevelHeaderNameString]
        ) {
          level = String(batch.messages[msgIdx].headers[constants.kafkaTraceLevelHeaderNameString]);
        }
        if (traceId != null || parentSpanId != null || level != null) {
          // Stop checking further batch messages once we have found a message with Instana headers.
          break;
        }
      }

      if (traceId == null && parentSpanId == null && level == null) {
        // The newer string header format has not been found, fall back to legacy binary headers.
        for (let msgIdx = 0; msgIdx < batch.messages.length; msgIdx++) {
          if (
            batch.messages[msgIdx].headers &&
            batch.messages[msgIdx].headers[constants.kafkaTraceContextHeaderNameBinary]
          ) {
            const traceContextBuffer = batch.messages[msgIdx].headers[constants.kafkaTraceContextHeaderNameBinary];
            if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
              const traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
              traceId = traceContext.t;
              parentSpanId = traceContext.s;
            }
          }
          level = readTraceLevelBinary(batch.messages[msgIdx]);
          if (traceId != null || parentSpanId != null || level != null) {
            break;
          }
        }
      }
    }

    return cls.ns.runAndReturn(() => {
      if (batch.messages && isSuppressed(level)) {
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

function isSuppressed(level) {
  return level === '0';
}

function readTraceLevelBinary(message) {
  if (message.headers[constants.kafkaTraceLevelHeaderNameBinary]) {
    const traceLevelBuffer = message.headers[constants.kafkaTraceLevelHeaderNameBinary];
    if (Buffer.isBuffer(traceLevelBuffer) && traceLevelBuffer.length >= 1) {
      return String(traceLevelBuffer.readInt8());
    }
  }
  return '1';
}

function addTraceContextHeaderToAllMessages(messages, span) {
  if (!traceCorrelationEnabled) {
    return;
  }
  switch (headerFormat) {
    case 'binary':
      addTraceContextHeaderToAllMessagesBinary(messages, span);
      break;
    case 'string':
      addTraceContextHeaderToAllMessagesString(messages, span);
      break;
    case 'both':
    // fall through (both is the default)
    default:
      addTraceContextHeaderToAllMessagesBinary(messages, span);
      addTraceContextHeaderToAllMessagesString(messages, span);
  }
}

function addTraceContextHeaderToAllMessagesBinary(messages, span) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        messages[msgIdx].headers = {
          [constants.kafkaTraceContextHeaderNameBinary]: tracingUtil.renderTraceContextToBuffer(span),
          [constants.kafkaTraceLevelHeaderNameBinary]: constants.kafkaTraceLevelBinaryValueInherit
        };
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceContextHeaderNameBinary] =
          tracingUtil.renderTraceContextToBuffer(span);
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderNameBinary] =
          constants.kafkaTraceLevelBinaryValueInherit;
      }
    }
  }
}

function addTraceContextHeaderToAllMessagesString(messages, span) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        messages[msgIdx].headers = {
          [constants.kafkaTraceIdHeaderNameString]: span.t,
          [constants.kafkaSpanIdHeaderNameString]: span.s
        };
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceIdHeaderNameString] = span.t;
        messages[msgIdx].headers[constants.kafkaSpanIdHeaderNameString] = span.s;
      }
    }
  }
}

function addTraceLevelSuppressionToAllMessages(messages) {
  if (!traceCorrelationEnabled) {
    return;
  }
  switch (headerFormat) {
    case 'binary':
      addTraceLevelSuppressionToAllMessagesBinary(messages);
      break;
    case 'string':
      addTraceLevelSuppressionToAllMessagesString(messages);
      break;
    case 'both':
    // fall through (both is the default)
    default:
      addTraceLevelSuppressionToAllMessagesBinary(messages);
      addTraceLevelSuppressionToAllMessagesString(messages);
  }
}

function addTraceLevelSuppressionToAllMessagesBinary(messages) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        messages[msgIdx].headers = {
          [constants.kafkaTraceLevelHeaderNameBinary]: constants.kafkaTraceLevelBinaryValueSuppressed
        };
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderNameBinary] =
          constants.kafkaTraceLevelBinaryValueSuppressed;
      }
    }
  }
}

function addTraceLevelSuppressionToAllMessagesString(messages) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        messages[msgIdx].headers = {
          [constants.kafkaTraceLevelHeaderNameString]: '0'
        };
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderNameString] = '0';
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
