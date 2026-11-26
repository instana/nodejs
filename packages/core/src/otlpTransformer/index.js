/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const common = require('./common');
const traces = require('./traces');
const metrics = require('./metrics');
const logs = require('./logs');
const { isLogSpan } = require('./traces/util');

/** @type {import('../config').InstanaConfig} */
let config;

/**
 * @param {'traces' | 'logs' | 'metrics'} signal
 * @returns {import('../exporter').ExportTarget}
 */
function getExportTarget(signal) {
  const otlpConfig = config?.tracing?.otlp;
  const path = `/v1/${signal}`;

  /** @type {import('../exporter').ExportTarget} */
  const target = { path, port: otlpConfig?.port };

  if (otlpConfig?.endpoint) {
    target.url = `${otlpConfig.endpoint.replace(/\/+$/, '')}${path}`;
    target.headers = otlpConfig.headers;
  }

  return target;
}

/**
 * @param {import('../config').InstanaConfig} _config
 */
function init(_config) {
  config = _config;
  common.init(_config);
  traces.init(_config);
  metrics.init(_config);
  logs.init(_config);
}

/**
 * @param {import('../config').InstanaConfig} _config
 */
function activate(_config) {
  config = _config;
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
  activate,
  splitSignals,
  getExportTarget,
  common,
  traces,
  metrics,
  logs
};
