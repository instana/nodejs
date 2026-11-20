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
 * @typedef {Object} ExportTarget
 * @property {string} [path] 
 * @property {number} [port] 
 * @property {string} [url] 
 * @property {Record<string, string>} [headers]
 */

/**
 * todo: config should be available here
 * @param {import('../config').InstanaConfig['tracing']['otlp']} otlpConfig
 * @param {'traces' | 'logs' | 'metrics'} signal
 * @returns {ExportTarget}
 */
function getExportTarget(otlpConfig, signal) {
  const path = `/v1/${signal}`;

  /** @type {ExportTarget} */
  const target = { path, port: otlpConfig?.port };

  if (otlpConfig?.endpoint) {
    target.url = `${otlpConfig.endpoint.replace(/\/+$/, '')}${path}`;
    target.headers = otlpConfig.headers;
  }

  return target;
}

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
  getExportTarget,
  common,
  traces,
  metrics,
  logs
};
