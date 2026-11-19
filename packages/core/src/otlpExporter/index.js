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
 * Describes where a payload should be delivered. It is generic on purpose, connections do not need to know that the
 * payload is OTLP. A connection uses the parts it can honor and falls back to its own default endpoint otherwise.
 *
 * @typedef {Object} ExportTarget
 * @property {string} [path] Request path, relative to the host the connection talks to (e.g. the agent).
 * @property {number} [port] Port on the host the connection talks to.
 * @property {string} [url] Absolute URL. Only set if an endpoint has been configured explicitly.
 * @property {Record<string, string>} [headers] Additional headers, to be used together with `url`.
 */

/**
 * Resolves where the payload of an OTLP signal has to be sent to.
 *
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
