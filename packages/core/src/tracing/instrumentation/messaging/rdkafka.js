/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const { limitTraceId } = require('../../tracingHeaders');
const leftPad = require('../../leftPad');
const constants = require('../../constants');
const cls = require('../../cls');
const shimmer = require('../../shimmer');
const { getFunctionArguments } = require('../../../util/function_arguments');
let traceCorrelationEnabled = constants.kafkaTraceCorrelationDefault;

let logger;
let isActive = false;
const technology = 'kafka';

exports.init = function init(config) {
  logger = config.logger;

  hook.onFileLoad(/\/node-rdkafka\/lib\/producer\.js/, instrumentProducer);
  hook.onFileLoad(/\/node-rdkafka\/lib\/kafka-consumer-stream\.js/, instrumentConsumerAsStream);
  hook.onModuleLoad('node-rdkafka', instrumentConsumer);

  hook.onModuleLoad('kafka-avro', logDeprecationKafkaAvroMessage);
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
};

exports.updateConfig = function updateConfig(config) {
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
};
// The extraConfig is coming from the agent configs. You can set the kafka format in the agent.
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

function instrumentProducer(ProducerClass) {
  shimmer.wrap(ProducerClass.prototype, 'produce', shimProduce);
}

function instrumentConsumer(module) {
  const className = 'KafkaConsumer';
  const originalKafkaConsumer = module[className];

  module[className] = function InstrumentedKafkaConsumer() {
    const that = new originalKafkaConsumer(...arguments);
    shimmer.wrap(that, 'emit', shimConsumerStreamEmit);
    return that;
  };

  // We need to recover all static methods and attributes
  // Currently, there is only one function: createReadStream
  const keys = Object.keys(originalKafkaConsumer);

  keys.forEach(key => {
    module[className][key] = originalKafkaConsumer[key];
  });
}

function instrumentConsumerAsStream(KafkaConsumerStream) {
  shimmer.wrap(KafkaConsumerStream.prototype, 'emit', shimConsumerStreamEmit);
}

function shimProduce(originalProduce) {
  return function () {
    /**
     * Arguments (ordered by their indexes):
     * - topic: string,
     * - partition: number,
     * - message: Buffer,
     * - key?: Kafka.MessageKey,
     * - timestamp?: number,
     * - opaque?: any,
     * - headers?: Kafka.MessageHeader[]
     */
    const originalArgs = getFunctionArguments(arguments);
    return instrumentedProduce(this, originalProduce, originalArgs);
  };
}

function shimConsumerStreamEmit(originalEmit) {
  return function () {
    /**
     * Arguments (ordered by their indexes):
     * - event name: string,
     * - chunk: Object | any,
     */
    const originalArgs = getFunctionArguments(arguments);

    if (!isActive) {
      return originalEmit.apply(this, originalArgs);
    }

    return instrumentedConsumerEmit(this, originalEmit, originalArgs);
  };
}

function instrumentedProduce(ctx, originalProduce, originalArgs) {
  const message = originalArgs[2];

  if (!message) {
    return originalProduce.apply(this, originalArgs);
  }

  const skipTracingResult = cls.skipExitTracing({ isActive, extendedResponse: true });

  if (skipTracingResult.skip) {
    if (skipTracingResult.suppressed) {
      const headers = addTraceLevelSuppression(originalArgs[6]);
      originalArgs[6] = headers;
    }

    return originalProduce.apply(ctx, originalArgs);
  }

  /**
   * When `dr_cb` is set to true in the producer options during the creation step, we have the chance to get a message
   * delivery callback, which makes our instrumentation more accurate in terms of message delivery success or failure.
   * If this option is not set to true, the 'delivery-report' is not triggered.
   * When this event is triggered, we get either an error or some pieces of the message back, which would indicate that
   * the message was delivered successfully.
   */
  const deliveryCb =
    ctx._cb_configs &&
    ctx._cb_configs.event &&
    ctx._cb_configs.event.delivery_cb &&
    typeof ctx._cb_configs.event.delivery_cb === 'function';

  return cls.ns.runAndReturn(() => {
    const topic = originalArgs[0];
    const spanData = {
      kafka: {
        endpoints: topic,
        operation: 'send'
      }
    };
    const span = cls.startSpan({
      spanName: 'kafka',
      kind: constants.EXIT,
      spanData
    });

    span.stack = tracingUtil.getStackTrace(instrumentedProduce, 1);

    originalArgs[6] = setTraceHeaders({
      headers: originalArgs[6],
      span
    });

    if (deliveryCb) {
      // TODO: Critical performance problems since 3.4.0
      // https://github.com/Blizzard/node-rdkafka/issues/1128
      // https://github.com/Blizzard/node-rdkafka/issues/1123#issuecomment-2855329479
      ctx.once('delivery-report', function instanaDeliveryReportListener(err) {
        span.d = Date.now() - span.ts;

        if (err) {
          span.ec = 1;
          const errorDetails = err.message;
          span.data[technology].error = errorDetails;
        }

        span.transmit();
      });
    }

    try {
      const result = originalProduce.apply(ctx, originalArgs);

      if (!deliveryCb) {
        span.d = Date.now() - span.ts;
        span.transmit();
      }

      return result;
    } catch (error) {
      // e.g. cannot send message because format is byte
      //      "Message must be a buffer or null"
      span.ec = 1;
      const errorDetails = error.message;
      span.data[technology].error = errorDetails;

      if (!deliveryCb) {
        span.d = Date.now() - span.ts;
        span.transmit();
      }

      throw error;
    }
  });
}

function removeInstanaHeadersFromMessage(messageData) {
  if (messageData.headers && messageData.headers.length) {
    for (let i = messageData.headers.length - 1; i >= 0; i--) {
      const headerObject = messageData.headers[i];
      // There should be only one. That's how the API works. This can be tested, for instance, by sending a message
      // via kafkajs to be recieved by rdkafka consumer. Each header will be a single object as an item in the
      // messageData.headers array
      const headerKey = Object.keys(headerObject)[0].toUpperCase();

      if (constants.allInstanaKafkaHeaders.includes(headerKey)) {
        messageData.headers.splice(i, 1);
      }
    }
  }
}

function instrumentedConsumerEmit(ctx, originalEmit, originalArgs) {
  let [event, eventData] = originalArgs;

  /**
   * If the stream batch is enabled, eventData will be an array. So in order to guarantee that array and non array cases
   * are covered, we make sure that the data is always an array, and loop through them at all times.
   */
  if (!Array.isArray(eventData)) {
    eventData = [eventData];
  }

  if (!isActive) {
    return originalEmit.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  if (parentSpan) {
    return originalEmit.apply(ctx, originalArgs);
  }

  if (event !== 'data' && event !== 'error') {
    return originalEmit.apply(ctx, originalArgs);
  }

  eventData.forEach(messageData => {
    const instanaHeaders = (messageData.headers || []).filter(headerObject => {
      const headerKey = Object.keys(headerObject)[0].toUpperCase();
      return constants.allInstanaKafkaHeaders.includes(headerKey);
    });

    // flatten array to object
    const instanaHeadersAsObject = {};
    instanaHeaders.forEach(instanaHeader => {
      const key = Object.keys(instanaHeader)[0].toUpperCase();
      instanaHeadersAsObject[key] = instanaHeader[key];
    });

    let traceId;
    let longTraceId;
    let parentSpanId;
    let level;

    if (instanaHeaders.length) {
      const {
        level: _level,
        traceId: _traceId,
        longTraceId: _longTraceId,
        parentSpanId: _parentSpanId
      } = findInstanaHeaderValues(instanaHeadersAsObject);

      traceId = _traceId;
      longTraceId = _longTraceId;
      parentSpanId = _parentSpanId;
      level = _level;

      removeInstanaHeadersFromMessage(messageData);
    }

    cls.ns.runAndReturn(function () {
      if (level && level === '0') {
        cls.setTracingLevel('0');
        return originalEmit.apply(ctx, originalArgs);
      }

      const spanData = {
        kafka: {
          endpoints: messageData.topic || 'empty',
          operation: 'consume'
        }
      };

      const span = cls.startSpan({
        spanName: 'kafka',
        kind: constants.ENTRY,
        traceId: traceId,
        parentSpanId: parentSpanId,
        spanData
      });

      if (longTraceId) {
        span.lt = longTraceId;
      }
      span.stack = tracingUtil.getStackTrace(instrumentedConsumerEmit, 1);

      // CASE: stream consumer receives error e.g. cannot connect to kafka
      if (event === 'error') {
        delete messageData.headers;

        span.ec = 1;
        const errorDetails = messageData.message;
        span.data[technology].error = errorDetails;
      }

      setImmediate(() => {
        span.d = Date.now() - span.ts;
        span.transmit();
      });

      return originalEmit.apply(ctx, originalArgs);
    });
  });
}

function addTraceContextHeader(headers, span) {
  if (!traceCorrelationEnabled) {
    return headers;
  }

  if (headers == null) {
    headers = [
      // Maintenance note (128-bit-trace-ids): We can remove the left-pad call here once we have switched to 128 bit
      // trace IDs. We already left-pad to the trace ID length (currently 16) in cls.js, when continuing the trace from
      // an upstream tracer.
      { [constants.kafkaTraceIdHeaderName]: leftPad(span.t, 32) },
      { [constants.kafkaSpanIdHeaderName]: span.s },
      { [constants.kafkaTraceLevelHeaderName]: '1' }
    ];
  } else if (headers && Array.isArray(headers)) {
    // Maintenance note (128-bit-trace-ids): We can remove the left-pad call here once we have switched to 128 bit trace
    // IDs, see above.
    headers.push({ [constants.kafkaTraceIdHeaderName]: leftPad(span.t, 32) });
    headers.push({ [constants.kafkaSpanIdHeaderName]: span.s });
    headers.push({ [constants.kafkaTraceLevelHeaderName]: '1' });
  }
  return headers;
}

function addTraceLevelSuppression(headers) {
  if (!traceCorrelationEnabled) {
    return headers;
  }

  if (headers == null) {
    headers = [
      {
        [constants.kafkaTraceLevelHeaderName]: '0'
      }
    ];
  } else if (headers && Array.isArray(headers)) {
    headers.push({ [constants.kafkaTraceLevelHeaderName]: '0' });
  }
  return headers;
}

function findInstanaHeaderValues(instanaHeadersAsObject) {
  let traceId;
  let longTraceId;
  let parentSpanId;
  let level;

  // Since v4, only 'string' format is supported.
  if (instanaHeadersAsObject[constants.kafkaTraceIdHeaderName]) {
    traceId = String(instanaHeadersAsObject[constants.kafkaTraceIdHeaderName]);
    if (traceId) {
      const limited = limitTraceId({ traceId });
      traceId = limited.traceId;
      longTraceId = limited.longTraceId;
    }
  }
  if (instanaHeadersAsObject[constants.kafkaSpanIdHeaderName]) {
    parentSpanId = String(instanaHeadersAsObject[constants.kafkaSpanIdHeaderName]);
  }
  if (instanaHeadersAsObject[constants.kafkaTraceLevelHeaderName]) {
    level = String(instanaHeadersAsObject[constants.kafkaTraceLevelHeaderName]);
  }

  return { level, traceId, longTraceId, parentSpanId };
}

function logDeprecationKafkaAvroMessage() {
  logger.warn(
    // eslint-disable-next-line max-len
    '[Deprecation Warning] The support for kafka-avro library is deprecated and might be removed in the next major release. See https://github.com/waldophotos/kafka-avro/issues/120'
  );
}
function setTraceHeaders({ headers, span }) {
  if (span.shouldSuppressDownstream) {
    // Suppress trace propagation to downstream services.
    return addTraceLevelSuppression(headers);
  } else {
    // Otherwise, inject the trace context into the headers for propagation.
    return addTraceContextHeader(headers, span);
  }
}
