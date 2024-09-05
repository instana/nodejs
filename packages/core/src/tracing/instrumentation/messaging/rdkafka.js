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
let configHeader = null;

let logger;
logger = require('../../../logger').getLogger('tracing/rdkafka', newLogger => {
  logger = newLogger;
});

let isActive = false;

exports.init = function init(config) {
  hook.onFileLoad(/\/node-rdkafka\/lib\/producer\.js/, instrumentProducer);
  hook.onFileLoad(/\/node-rdkafka\/lib\/kafka-consumer-stream\.js/, instrumentConsumerAsStream);
  hook.onModuleLoad('node-rdkafka', instrumentConsumer);

  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
  configHeader = config.tracing.kafka.headerFormat;
};

exports.updateConfig = function updateConfig(config) {
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
  configHeader = config.tracing.kafka.headerFormat;
};
// The extraConfig is coming from the agent configs. You can set the kafka format in the agent.
exports.activate = function activate(extraConfig) {
  let extraConfigHeader = null;
  if (extraConfig && extraConfig.tracing && extraConfig.tracing.kafka) {
    if (extraConfig.tracing.kafka.traceCorrelation != null) {
      traceCorrelationEnabled = extraConfig.tracing.kafka.traceCorrelation;
    }
    extraConfigHeader = extraConfig.tracing.kafka.headerFormat;
  }
  if (extraConfigHeader || configHeader) {
    logWarningForKafkaHeaderFormat(extraConfigHeader || configHeader);
  }
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

// Note: This function can be removed as soon as we finish the Kafka header migration phase 2 and remove the ability to
// configure the header format.
function logWarningForKafkaHeaderFormat(headerFormat) {
  logger.warn(
    '[Deprecation Warning] The configuration option for specifying the Kafka header format will be removed in the ' +
      "next major release. The default header format will be 'string'."
  );
  // node-rdkafka's handling of non-string header values is broken, see
  // https://github.com/Blizzard/node-rdkafka/pull/968.
  //
  // For this reason, the legacy binary header format for Instana Kafka trace correlation headers (X_INSTANA_C) will not
  // work with node-rdkafka. Fortunately, we are already in the process of migrating away from that binary header format
  // to a header format that is purely based on string values.
  //
  // Trace correlation would be broken for rdkafka senders with the header format 'binary'. If that format has been
  // configured explicitly, we log a warning and ignore the config value. The rdkafka instrumentation alwas acts as if
  // format 'string' had been configured.
  if (headerFormat === 'binary' || headerFormat === 'both') {
    logger.warn(
      `Ignoring configuration value '${headerFormat}' for Kafka header format in node-rdkafka instrumentation, ` +
        " using header format 'string' instead. Binary headers do not work with node-rdkafka, see " +
        'https://github.com/Blizzard/node-rdkafka/pull/968.'
    );
  }
}

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
    const span = cls.startSpan('kafka', constants.EXIT);
    const topic = originalArgs[0];

    span.stack = tracingUtil.getStackTrace(instrumentedProduce, 1);
    span.data.kafka = {
      service: topic,
      access: 'send'
    };

    const headers = addTraceContextHeader(originalArgs[6], span);
    originalArgs[6] = headers;

    if (deliveryCb) {
      ctx.once('delivery-report', function instanaDeliveryReportListener(err) {
        span.d = Date.now() - span.ts;

        if (err) {
          span.ec = 1;
          span.data.kafka.error = err.message;
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
      span.data.kafka.error = error.message;

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

      const span = cls.startSpan('kafka', constants.ENTRY, traceId, parentSpanId);
      if (longTraceId) {
        span.lt = longTraceId;
      }
      span.stack = tracingUtil.getStackTrace(instrumentedConsumerEmit, 1);

      span.data.kafka = {
        access: 'consume',
        service: messageData.topic || 'empty'
      };

      // CASE: stream consumer receives error e.g. cannot connect to kafka
      if (event === 'error') {
        delete messageData.headers;

        span.ec = 1;
        span.data.kafka.error = messageData.message;
      }

      setImmediate(() => {
        span.d = Date.now() - span.ts;
        span.transmit();
      });

      return originalEmit.apply(ctx, originalArgs);
    });
  });
}

function readTraceLevelBinary(instanaHeadersAsObject) {
  if (instanaHeadersAsObject[constants.kafkaLegacyTraceLevelHeaderName]) {
    const traceLevelBuffer = instanaHeadersAsObject[constants.kafkaLegacyTraceLevelHeaderName];
    if (Buffer.isBuffer(traceLevelBuffer) && traceLevelBuffer.length >= 1) {
      return String(traceLevelBuffer.readInt8());
    }
  }
  return '1';
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

  // CASE: Look for the the newer string header format first.
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

  // CASE: Only fall back to legacy binary trace correlation headers if no new header is present.
  if (traceId == null && parentSpanId == null && level == null) {
    // The newer string header format has not been found, fall back to legacy binary headers.
    if (instanaHeadersAsObject[constants.kafkaLegacyTraceContextHeaderName]) {
      const traceContextBuffer = instanaHeadersAsObject[constants.kafkaLegacyTraceContextHeaderName];

      if (Buffer.isBuffer(traceContextBuffer) && traceContextBuffer.length === 24) {
        const traceContext = tracingUtil.readTraceContextFromBuffer(traceContextBuffer);
        traceId = traceContext.t;
        parentSpanId = traceContext.s;
      }
    }

    level = readTraceLevelBinary(instanaHeadersAsObject);
  }

  return { level, traceId, longTraceId, parentSpanId };
}
