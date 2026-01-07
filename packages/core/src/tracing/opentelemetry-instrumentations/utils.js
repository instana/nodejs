/*
 * (c) Copyright IBM Corp. 2025

 */

'use strict';

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

module.exports = {
  getSamplingDecision
};
