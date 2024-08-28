/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const { limitTraceId } = require('../../tracingHeaders');
const leftPad = require('../../leftPad');
const constants = require('../../constants');
const cls = require('../../cls');

let logger;
logger = require('../../../logger').getLogger('tracing/kafkajs', newLogger => {
  logger = newLogger;
});

let traceCorrelationEnabled = constants.kafkaTraceCorrelationDefault;

let isActive = false;

exports.init = function init(config) {
  hook.onFileLoad(/\/kafkajs\/src\/producer\/messageProducer\.js/, instrumentProducer);
  hook.onFileLoad(/\/kafkajs\/src\/consumer\/runner\.js/, instrumentConsumer);
  hook.onModuleLoad('kafkajs', logWarningForKafkaHeaderFormat);
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
};

exports.updateConfig = function updateConfig(config) {
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
};

exports.activate = function activate(extraConfig) {
  if (extraConfig && extraConfig.tracing && extraConfig.tracing.kafka) {
    if (extraConfig.tracing.kafka.traceCorrelation != null) {
      traceCorrelationEnabled = extraConfig.tracing.kafka.traceCorrelation;
    }
  }
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
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
  return async function (config /* { topic, messages } */) {
    const topic = config.topic;
    const messages = config.messages;

    const skipTracingResult = cls.skipExitTracing({ isActive, extendedResponse: true });

    if (skipTracingResult.skip || !messages || messages.length === 0) {
      if (skipTracingResult.suppressed) {
        addTraceLevelSuppressionToAllMessages(messages);
      }

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
  return async function (config /* { topicMessages } */) {
    const topicMessages = config.topicMessages;

    const skipTracingResult = cls.skipExitTracing({ isActive, extendedResponse: true });

    if (skipTracingResult.skip || !topicMessages || topicMessages.length === 0) {
      if (skipTracingResult.suppressed) {
        topicMessages.forEach(topicMessage => {
          addTraceLevelSuppressionToAllMessages(topicMessage.messages);
        });
      }

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
    let longTraceId;
    let parentSpanId;
    let level;
    if (message && message.headers) {
      // Look for the the newer string header format first.
      if (message.headers[constants.kafkaTraceIdHeaderName]) {
        traceId = String(message.headers[constants.kafkaTraceIdHeaderName]);
        if (traceId) {
          const limited = limitTraceId({ traceId });
          traceId = limited.traceId;
          longTraceId = limited.longTraceId;
        }
      }
      if (message.headers[constants.kafkaSpanIdHeaderName]) {
        parentSpanId = String(message.headers[constants.kafkaSpanIdHeaderName]);
      }
      if (message.headers[constants.kafkaTraceLevelHeaderName]) {
        level = String(message.headers[constants.kafkaTraceLevelHeaderName]);
      }
    }

    removeInstanaHeadersFromMessage(message);

    return cls.ns.runAndReturn(() => {
      if (isSuppressed(level)) {
        cls.setTracingLevel('0');
        return originalEachMessage.apply(ctx, originalArgs);
      }

      const span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
      if (longTraceId) {
        span.lt = longTraceId;
      }
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
    let longTraceId;
    let parentSpanId;
    let level;
    if (batch.messages) {
      // Look for the the newer string header format first.
      for (let msgIdx = 0; msgIdx < batch.messages.length; msgIdx++) {
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaTraceIdHeaderName]) {
          traceId = String(batch.messages[msgIdx].headers[constants.kafkaTraceIdHeaderName]);
          if (traceId) {
            const limited = limitTraceId({ traceId });
            traceId = limited.traceId;
            longTraceId = limited.longTraceId;
          }
        }
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaSpanIdHeaderName]) {
          parentSpanId = String(batch.messages[msgIdx].headers[constants.kafkaSpanIdHeaderName]);
        }
        if (batch.messages[msgIdx].headers && batch.messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName]) {
          level = String(batch.messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName]);
        }
        if (traceId != null || parentSpanId != null || level != null) {
          // Stop checking further batch messages once we have found a message with Instana headers.
          break;
        }
      }

      for (let msgIdx = 0; msgIdx < batch.messages.length; msgIdx++) {
        removeInstanaHeadersFromMessage(batch.messages[msgIdx]);
      }
    }

    return cls.ns.runAndReturn(() => {
      if (batch.messages && isSuppressed(level)) {
        cls.setTracingLevel('0');
        return originalEachBatch.apply(ctx, originalArgs);
      }

      const span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
      if (longTraceId) {
        span.lt = longTraceId;
      }
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

function addTraceContextHeaderToAllMessages(messages, span) {
  if (!traceCorrelationEnabled) {
    return;
  }

  addTraceIdSpanIdToAllMessages(messages, span);
}

function addTraceIdSpanIdToAllMessages(messages, span) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        messages[msgIdx].headers = {
          // Maintenance note (128-bit-trace-ids): We can remove the left-pad call here once we have switched to 128 bit
          // trace IDs. We already left-pad to the trace ID length (currently 16) in cls.js, when continuing the trace
          // from an upstream tracer.
          [constants.kafkaTraceIdHeaderName]: leftPad(span.t, 32),
          [constants.kafkaSpanIdHeaderName]: span.s
        };
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceIdHeaderName] = leftPad(span.t, 32);
        messages[msgIdx].headers[constants.kafkaSpanIdHeaderName] = span.s;
      }
    }
  }
}

function addTraceLevelSuppressionToAllMessages(messages) {
  if (!traceCorrelationEnabled) {
    return;
  }
  addTraceLevelSuppressionToAllMessagesString(messages);
}

function addTraceLevelSuppressionToAllMessagesString(messages) {
  if (Array.isArray(messages)) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      if (messages[msgIdx].headers == null) {
        messages[msgIdx].headers = {
          [constants.kafkaTraceLevelHeaderName]: '0'
        };
      } else if (messages[msgIdx].headers && typeof messages[msgIdx].headers === 'object') {
        messages[msgIdx].headers[constants.kafkaTraceLevelHeaderName] = '0';
      }
    }
  }
}

function removeInstanaHeadersFromMessage(message) {
  if (message.headers && typeof message.headers === 'object') {
    constants.allInstanaKafkaHeaders.forEach(name => {
      // If the header is not present, deleting it is a no-op.
      delete message.headers[name];
    });
  }
}

// Note: This function can be removed as soon as we finish the Kafka header migration phase2.
// Might happen in major release v4.
function logWarningForKafkaHeaderFormat() {
  logger.warn(
    '[Deprecation Warning] The configuration option for specifying the Kafka header format will be removed in the ' +
      'next major release as the format will no longer be configurable and Instana tracers will only send string ' +
      'headers. More details see: https://ibm.biz/kafka-trace-correlation-header.'
  );
}
