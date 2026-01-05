/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');
const W3cTraceContext = require('../w3c_trace_context/W3cTraceContext');

module.exports.init = () => {
  const { ConfluentKafkaInstrumentation } = require('@instana/instrumentation-confluent-kafka-javascript');

  const instrumentation = new ConfluentKafkaInstrumentation({});

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = otelSpan => {
  if (otelSpan.attributes?.['messaging.operation.type'] === 'receive') {
    return constants.ENTRY;
  }

  return constants.EXIT;
};

/**
 * The Otel instrumentations are part of our tracing pipeline.
 * As soon as there is an Exit -> Entry pair (such as Kafka), we have to manipulate
 * the Otel context to inject our Instana ids into the W3C trace context, because Otel internally creates their
 * own W3C trace context ids (via tracer.startSpan()). We do not monkey patch `startSpan` currently.
 *
 * The flow is:
 * - trace.setSpan(context.active(), span);
 * - wrap.js setSpan override
 * - create Instana span
 * - manipulate the returned context of `setSpan` with our ids
 * - the Otel span will be cleaned up automatically from Otel SDK
 */
module.exports.setW3CTraceContext = (api, preparedData, otelSpan, originalCtx) => {
  if (preparedData.kind !== constants.EXIT) {
    return originalCtx;
  }

  const instanaSpan = otelSpan._instanaSpan;
  const otelSpanContext = otelSpan.spanContext();
  let w3cTraceContext;

  // CASE 1: Instana Tracing is suppressed, we do not create the Instana span - see transformToInstanaSpan in wrap.js.
  //         We take the original Otel ids and forward the suppression state. The entry span will follow the decision.
  // CASE 2: Instana Tracing is active, we push the Instana ids into the Otel context.
  if (!instanaSpan) {
    w3cTraceContext = W3cTraceContext.createEmptyUnsampled(otelSpanContext.traceId, otelSpanContext.spanId);
  } else {
    w3cTraceContext = W3cTraceContext.fromInstanaIds(instanaSpan.t, instanaSpan.s, preparedData.isSuppressed === false);
  }

  const carrier = {};
  carrier[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();

  return api.propagation.extract(originalCtx, carrier);
};

/**
 * We have to extract the w3c information from the otel span, because
 * the entry otel span will contain our Instana trace and parent information, which we have to
 * extract and connect to our Instana spans to keep the correlation.
 */
module.exports.extractW3CTraceContext = (preparedData, otelSpan) => {
  const result = {
    traceId: null,
    parentSpanId: null
  };

  if (preparedData.kind !== constants.ENTRY) {
    return result;
  }

  const spanContext = otelSpan.parentSpanContext;

  if (spanContext?.traceId) {
    result.traceId = spanContext.traceId.substring(16);
  }

  if (spanContext?.spanId) {
    result.parentSpanId = spanContext.spanId;
  }

  return result;
};
