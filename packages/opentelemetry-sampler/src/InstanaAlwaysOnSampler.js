/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { SamplingDecision, TraceFlags, trace } = require('@opentelemetry/api');

class InstanaAlwaysOnSampler {
  /**
   * The Instana always on sampler can only be used in combination with the
   * Instana propagator.
   *
   * The sampler will read the span context and check whether tracing is enabled based
   * on the incoming Instana headers.
   */
  shouldSample(context) {
    // NOTE: We need to use `RECORD_AND_SAMPLED`, otherwise `traceFlags` will be set to 0 (0000 0000)
    let decision = SamplingDecision.RECORD_AND_SAMPLED;
    try {
      const nonRecordingSpan = trace.getSpan(context).spanContext();

      // https://www.w3.org/TR/trace-context/#trace-flags
      // eslint-disable-next-line no-bitwise
      if ((nonRecordingSpan.traceFlags & TraceFlags.SAMPLED) !== TraceFlags.SAMPLED) {
        decision = SamplingDecision.NOT_RECORD;
      }
    } catch (e) {
      // ignore
    }

    return {
      decision
    };
  }

  toString() {
    return 'InstanaAlwaysOnSampler';
  }
}

module.exports = InstanaAlwaysOnSampler;
