/*
 * (c) Copyright IBM Corp. 2025

 */

/* [object Object]
[object Object]
[object Object]
[object Object] */

'use strict';

const constants = require('../constants');
const W3cTraceContext = require('../w3c_trace_context/W3cTraceContext');
const TraceFlags = require('./files/trace_flags').TraceFlags;

// @ts-ignore
const getSamplingDecision = otelSpan => {
  let sampled = true;
  const spanContext = otelSpan.spanContext();

  if (spanContext?.traceFlags !== undefined) {
    // @ts-ignore
    // eslint-disable-next-line no-bitwise
    const isSampled = (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED;
    if (!isSampled) {
      sampled = false;
    }
  }

  return sampled;
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
const setW3CTraceContext = (
  /** @type {{ propagation: { extract: (arg0: any, arg1: {}) => any; }; }} */ api,
  /** @type {{ kind: number; isSuppressed: boolean; }} */ preparedData,
  /** @type {{ spanContext: () => any; }} */ otelSpan,
  /** @type {{ t: string; s: string; }} */ instanaSpan,
  /** @type {any} */ originalCtx
) => {
  if (preparedData.kind !== constants.EXIT) {
    return originalCtx;
  }

  const otelSpanContext = otelSpan.spanContext();
  let w3cTraceContext;

  // CASE 1: Instana Tracing is suppressed, we do not create the Instana span - see transformToInstanaSpan in wrap.js.
  //         We take the original Otel ids and forward the suppression state. The entry span will follow the decision.
  // CASE 2: Instana Tracing is active, we push the Instana ids into the Otel context.
  if (!instanaSpan) {
    w3cTraceContext = W3cTraceContext.fromOtelIds(
      otelSpanContext.traceId,
      otelSpanContext.spanId,
      preparedData.isSuppressed === false
    );
  } else {
    w3cTraceContext = W3cTraceContext.fromInstanaIds(instanaSpan.t, instanaSpan.s, preparedData.isSuppressed === false);
  }

  const carrier = {};
  // @ts-ignore
  carrier[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();

  return api.propagation.extract(originalCtx, carrier);
};

/**
 * We have to extract the w3c information from the otel span, because
 * the entry otel span will contain our Instana trace and parent information, which we have to
 * extract and connect to our Instana spans to keep the correlation.
 */
const extractW3CTraceContext = (
  /** @type {{ kind: number; }} */ preparedData,
  /** @type {{ parentSpanContext: any; }} */ otelSpan
) => {
  const result = {
    // @ts-ignore
    traceId: null,
    // @ts-ignore
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

module.exports = {
  getSamplingDecision,
  setW3CTraceContext,
  extractW3CTraceContext
};
