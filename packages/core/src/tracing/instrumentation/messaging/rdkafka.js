/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const { limitTraceId } = require('../../tracingHeaders');
const leftPad = require('../../leftPad');
const constants = require('../../constants');
const cls = require('../../cls');
const shimmer = require('shimmer');
const { getFunctionArguments } = require('../../../util/function_arguments');

let logger;
logger = require('../../../logger').getLogger('tracing/rdkafka', newLogger => {
  logger = newLogger;
});

let traceCorrelationEnabled = constants.kafkaTraceCorrelationDefault;
let headerFormat = constants.kafkaHeaderFormatDefault;
overrideKafkaHeaderFormat();

let isActive = false;

exports.init = function init(config) {
  requireHook.onFileLoad(/\/node-rdkafka\/lib\/producer\.js/, instrumentProducer);
  requireHook.onFileLoad(/\/node-rdkafka\/lib\/kafka-consumer-stream\.js/, instrumentConsumerAsStream);
  requireHook.onModuleLoad('node-rdkafka', instrumentConsumer);

  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
  headerFormat = config.tracing.kafka.headerFormat;
  overrideKafkaHeaderFormat();
};

exports.updateConfig = function updateConfig(config) {
  traceCorrelationEnabled = config.tracing.kafka.traceCorrelation;
  headerFormat = config.tracing.kafka.headerFormat;
  overrideKafkaHeaderFormat();
};

exports.activate = function activate(extraConfig) {
  if (extraConfig && extraConfig.tracing && extraConfig.tracing.kafka) {
    if (extraConfig.tracing.kafka.traceCorrelation != null) {
      traceCorrelationEnabled = extraConfig.tracing.kafka.traceCorrelation;
    }
    if (typeof extraConfig.tracing.kafka.headerFormat === 'string') {
      headerFormat = extraConfig.tracing.kafka.headerFormat;
      overrideKafkaHeaderFormat();
    }
  }
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

// Note: This function can be removed as soon as we switch to 'both' as the default header format.
function overrideKafkaHeaderFormat() {
  // node-rdkafka's handling of non-string header values is broken, see
  // https://github.com/Blizzard/node-rdkafka/pull/933 and https://github.com/Blizzard/node-rdkafka/pull/935.
  //
  // Thus, our current binary header format for Instana Kafka trace correlation headers (X_INSTANA_C) will not work with
  // node-kafka. Fortunately, we are already planning to migrate away from that header format to a string based header
  // format. That customer facing phase of that migration has not started yet, thus the the option `headerFormat` has
  // not yet been documented publicly.
  //
  // To ensure customers can use rdkafka instrumentation with trace correlation, we set the default value for
  // headerFormat to "both" here, instead of "binary". That means we send both header formats by default.
  //
  // - Node.js rdkafka producer -> any Node.js/Java/.Net receiver: trace correlation works as expected, since consumers
  //   will look for both string and binary headers.
  // - Node.js rdkafka producer -> Go consumer does not work yet, until the Go tracer implements phase 0 of the
  //   Kafka header migration.
  if (headerFormat === 'binary') {
    headerFormat = 'both';
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
      logger.debug('Will not instrument');
      return originalEmit.apply(this, originalArgs);
    }

    return instrumentedConsumerEmit(this, originalEmit, originalArgs);
  };
}

function instrumentedProduce(ctx, originalProduce, originalArgs) {
  const message = originalArgs[2];

  if (!message) {
    logger.debug('Will not instrument');
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
  switch (headerFormat) {
    case 'binary':
      return addTraceContextHeaderBinary(headers, span);
    case 'string':
      return addTraceContextHeaderString(headers, span);
    case 'both':
    // fall through (both is the default)
    default:
      return addTraceContextHeaderBinary(addTraceContextHeaderString(headers, span), span);
  }
}

/**
 * At the time of this instrumentation, the node-rdkafka had an issue with handling binary content, where any zeros
 * found in the beginning of the data are trimmed out, and any number higher than 127 is replaced by "unknown".
 * More details in the PR that fixes the issue: https://github.com/Blizzard/node-rdkafka/pull/935.
 *
 * This means that customers using node-rdkafka or any libs that depend on it will not have proper span correlation
 * when headers are sent as binary. The exit and entry spans will still be created though.
 * It's important to know that customers using node-rdkafka only as consumers, where the producer was another runtime
 * instrumented by Instana, the correlation should work as intended. The problem lies only in the node-rdkafka producer.
 */
function addTraceContextHeaderBinary(headers, span) {
  if (headers == null) {
    headers = [
      { [constants.kafkaLegacyTraceContextHeaderName]: tracingUtil.renderTraceContextToBuffer(span) },
      { [constants.kafkaLegacyTraceLevelHeaderName]: constants.kafkaLegacyTraceLevelValueInherit }
    ];
  } else if (headers && Array.isArray(headers)) {
    headers.push({ [constants.kafkaLegacyTraceContextHeaderName]: tracingUtil.renderTraceContextToBuffer(span) });
    headers.push({ [constants.kafkaLegacyTraceLevelHeaderName]: constants.kafkaLegacyTraceLevelValueInherit });
  }
  return headers;
}

function addTraceContextHeaderString(headers, span) {
  if (headers == null) {
    headers = [
      { [constants.kafkaTraceIdHeaderName]: leftPad(span.t, 32) },
      { [constants.kafkaSpanIdHeaderName]: span.s },
      { [constants.kafkaTraceLevelHeaderName]: '1' }
    ];
  } else if (headers && Array.isArray(headers)) {
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
  switch (headerFormat) {
    case 'binary':
      return addTraceLevelSuppressionBinary(headers);
    case 'string':
      return addTraceLevelSuppressionString(headers);
    case 'both':
    // fall through (both is the default)
    default:
      return addTraceLevelSuppressionString(addTraceLevelSuppressionBinary(headers));
  }
}

function addTraceLevelSuppressionBinary(headers) {
  if (headers == null) {
    headers = [
      {
        [constants.kafkaLegacyTraceLevelHeaderName]: constants.kafkaLegacyTraceLevelValueSuppressed
      }
    ];
  } else if (headers && typeof Array.isArray(headers)) {
    headers.push({ [constants.kafkaLegacyTraceLevelHeaderName]: constants.kafkaLegacyTraceLevelValueSuppressed });
  }
  return headers;
}

function addTraceLevelSuppressionString(headers) {
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
