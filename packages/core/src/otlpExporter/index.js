/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const common = require('./common');
const traces = require('./traces');
const metrics = require('./metrics');
const logs = require('./logs');
const { isLogSpan } = require('./traces/util');

/**
 * @param {import('../config').InstanaConfig} config
 */
function init(config) {
  common.init(config);
  traces.init(config);
  metrics.init(config);
  logs.init(config);
}

/**
 * OTLP exports traces and logs as separate signals. Splits the spans in a single pass into the spans that belong
 * into the traces payload and the spans that must be exported as log records.
 *
 * TODO: A non-log span with span.ec > 0 should produce two outputs: the normal trace span (stays in traceSpans) and
 *       an additional log record for the exception (also added to logSpans).
 *
 * @param {import('../core').InstanaBaseSpan[]} spans
 * @returns {{ traceSpans: import('../core').InstanaBaseSpan[], logSpans: import('../core').InstanaBaseSpan[] }}
 */
function splitSignals(spans) {
  const traceSpans = [];
  const logSpans = [];

  for (let i = 0; i < spans.length; i++) {
    if (isLogSpan(spans[i])) {
      logSpans.push(spans[i]);
    } else {
      traceSpans.push(spans[i]);
    }
  }

  return { traceSpans, logSpans };
}

module.exports = {
  init,
  splitSignals,
  common,
  traces,
  metrics,
  logs
};
