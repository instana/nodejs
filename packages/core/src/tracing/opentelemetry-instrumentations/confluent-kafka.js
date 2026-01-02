/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

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

module.exports.manipulateOtelSpan = (api, otelSpan, instanaSpan, originalCtx) => {
  const W3cTraceContext = require('../w3c_trace_context/W3cTraceContext');
  const w3cTraceContext = new W3cTraceContext();
  w3cTraceContext.instanaTraceId = instanaSpan.t;
  w3cTraceContext.instanaParentId = instanaSpan.s;
  w3cTraceContext.traceParentTraceId = instanaSpan.t ? instanaSpan.t.padStart(32, '0') : null;
  w3cTraceContext.traceParentParentId = instanaSpan.s;
  w3cTraceContext.sampled = true;
  w3cTraceContext.traceParentValid = true;
  w3cTraceContext.traceStateValid = true;

  const carrier = {};
  carrier[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();
  if (w3cTraceContext.hasTraceState()) {
    carrier[constants.w3cTraceState] = w3cTraceContext.renderTraceState();
  }
  return api.propagation.extract(originalCtx, carrier);
};

module.exports.getKind = otelSpan => {
  if (isEntrySpan(otelSpan)) {
    return constants.ENTRY;
  }

  return constants.EXIT;
};

module.exports.getTraceId = (kind, otelSpan) => {
  if (kind === constants.ENTRY) {
    const spanContext = otelSpan._spanContext;
    if (spanContext?.traceState) {
      const traceState = spanContext.traceState;
      const traceParentTraceId = spanContext.traceId;

      const w3cTraceContext = require('../w3c_trace_context/parse').execute(
        `00-${traceParentTraceId}-${spanContext.spanId}-01`,
        traceState.toString()
      );
      if (w3cTraceContext.instanaTraceId) {
        return w3cTraceContext.instanaTraceId;
      }
    }

    const otelTraceId = otelSpan._spanContext.traceId;
    if (otelTraceId && otelTraceId.length === 32) {
      return otelTraceId.substring(16);
    }
    return otelTraceId;
  }

  return null;
};

module.exports.getParentId = (kind, otelSpan) => {
  if (kind === constants.ENTRY) {
    const spanContext = otelSpan._spanContext;
    if (spanContext?.traceState) {
      const traceState = spanContext.traceState;
      const traceParentTraceId = spanContext.traceId;
      let traceStateString = traceState.toString();

      if (!traceStateString || !traceStateString.includes(constants.w3cInstanaEquals)) {
        const instanaValue = traceState.get(constants.w3cInstana);
        if (instanaValue) {
          traceStateString = `${constants.w3cInstanaEquals}${instanaValue}`;
        }
      }
      const w3cTraceContext = require('../w3c_trace_context/parse').execute(
        `00-${traceParentTraceId}-${spanContext.spanId}-01`,
        traceStateString
      );
      if (w3cTraceContext.instanaParentId) {
        return w3cTraceContext.instanaParentId;
      }
    }
    return otelSpan.parentSpanId;
  }

  return null;
};
