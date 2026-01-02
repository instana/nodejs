/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');
const W3cTraceContext = require('../w3c_trace_context/W3cTraceContext');

const isEntrySpan = otelSpan => otelSpan.attributes?.['messaging.operation.type'] === 'receive';

module.exports.init = () => {
  // NOTE: Otel instrumentations sometimes require the target library TYPE to mock on top of their instrumentation.
  //       This works, because "import type" does not load the target library.
  // eslint-disable-next-line max-len
  // EXAMPLE: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/instrumentation-express-v0.57.1/packages/instrumentation-express/src/instrumentation.ts#L25
  const { ConfluentKafkaInstrumentation } = require('@drazke/instrumentation-confluent-kafka-javascript');

  const instrumentation = new ConfluentKafkaInstrumentation({});

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = otelSpan => {
  if (isEntrySpan(otelSpan)) {
    return constants.ENTRY;
  }

  return constants.EXIT;
};

module.exports.setW3CTraceContext = (api, preparedData, otelSpan, originalCtx) => {
  if (preparedData.kind !== constants.EXIT) {
    return originalCtx;
  }

  const instanaSpan = otelSpan._instanaSpan;
  const otelSpanContext = otelSpan.spanContext();

  const w3cTraceContext = W3cTraceContext.fromInstanaIds(
    instanaSpan ? instanaSpan.t : otelSpanContext.traceId,
    instanaSpan ? instanaSpan.s : otelSpanContext.spanId,
    // If Instana suppressed is true, sampled should be false!
    preparedData.isSuppressed === false
  );

  const carrier = {};
  carrier[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();
  if (w3cTraceContext.hasTraceState()) {
    carrier[constants.w3cTraceState] = w3cTraceContext.renderTraceState();
  }

  return api.propagation.extract(originalCtx, carrier);
};

module.exports.extractW3CTraceContext = (preparedData, otelSpan) => {
  const result = {
    traceId: null,
    parentSpanId: null
  };

  if (preparedData.kind !== constants.ENTRY) {
    return result;
  }

  const spanContext = otelSpan.parentSpanContext || otelSpan._spanContext;

  if (spanContext?.traceState) {
    const traceState = spanContext.traceState;
    const instanaValue = traceState.get(constants.w3cInstana);
    if (instanaValue) {
      const parts = instanaValue.split(';');
      if (parts.length === 2) {
        result.traceId = parts[0];
        result.parentSpanId = parts[1];
      }
    }
  }

  if (!result.traceId && spanContext?.traceId) {
    const otelTraceId = spanContext.traceId;
    if (otelTraceId.length === 32) {
      result.traceId = otelTraceId.substring(16);
    } else {
      result.traceId = otelTraceId;
    }
  }

  if (!result.parentSpanId) {
    result.parentSpanId = otelSpan.parentSpanId || spanContext?.spanId;
  }

  return result;
};
