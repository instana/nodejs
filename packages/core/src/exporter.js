/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const instanaBackendMapper = require('./tracing/backend_mappers');
const otlpExporter = require('./otlpTransformer');

/**
 * @typedef {Array<import('./core').InstanaBaseSpan>} InstanaSpans
 * @typedef {(error?: Error, failedSpans?: InstanaSpans) => void} ExportCallback
 *
 * @typedef {Object} Format
 * @property {(spans: InstanaSpans, cb: ExportCallback) => void} exportSpans
 *   Transforms and sends the spans. The callback is called exactly once. If anything could not be sent, it receives the
 *   (internal format) spans that need to be retried.
 * @property {(spans: InstanaSpans) => any} transformSpans
 *   Transforms the spans into the trace payload without sending it (used when the spans are shipped as a bundle).
 * @property {(payload: Object<string, *>, cb: (...args: *) => *) => void} exportMetrics
 */

/** @type {import('./core').GenericLogger} */
let logger;
/** @type {import('.').DownstreamConnection & { sendMetrics?: Function }} */
let connection;
/** @type {Format} */
let format;
/**
 * Resolved once per (re-)configuration, not per export.
 * @type {Record<'traces' | 'logs' | 'metrics', import('./otlpExporter').ExportTarget>}
 */
let targets;

/** @type {Format} */
const instanaFormat = {
  transformSpans(spans) {
    return (
      spans
        // Transform internal span data format into external (backend) readable format.
        .map(span => instanaBackendMapper.transform(span))
        .filter(span => {
          if (span.t != null) {
            return true;
          }

          logger.debug(`Span of type ${span.n} has no trace ID. Not transmitting this span.`);
          return false;
        })
    );
  },

  exportSpans(spans, cb) {
    connection.sendSpans(instanaFormat.transformSpans(spans), (/** @type {Error} */ error) => {
      cb(error, error ? spans : undefined);
    });
  },

  exportMetrics(payload, cb) {
    connection.sendMetrics(payload, cb);
  }
};

/** @type {Format} */
const otlpFormat = {
  transformSpans(spans) {
    // Log spans are exported as a separate signal and are not part of the OTLP traces payload.
    return otlpExporter.traces.transform(otlpExporter.splitSignals(spans).traceSpans);
  },

  exportSpans(spans, cb) {
    const { traceSpans, logSpans } = otlpExporter.splitSignals(spans);

    /** @type {Array<{ spans: InstanaSpans, send: (done: (error?: Error) => void) => void }>} */
    const signals = [];

    if (traceSpans.length > 0) {
      signals.push({
        spans: traceSpans,
        send: done => connection.sendSpans(otlpExporter.traces.transform(traceSpans), done, targets.traces)
      });
    }

    if (logSpans.length > 0) {
      if (typeof connection.sendLogs === 'function') {
        signals.push({
          spans: logSpans,
          send: done => connection.sendLogs(otlpExporter.logs.transform(logSpans), done, targets.logs)
        });
      } else {
        logger.debug('Configured downstreamConnection has no function "sendLogs". Not transmitting log spans.');
      }
    }

    if (signals.length === 0) {
      return cb();
    }

    let pending = signals.length;
    /** @type {Error} */
    let firstError;
    /** @type {InstanaSpans} */
    let failedSpans = [];

    signals.forEach(signal => {
      signal.send((/** @type {Error} */ error) => {
        if (error) {
          firstError = firstError || error;
          failedSpans = failedSpans.concat(signal.spans);
        }

        if (--pending === 0) {
          cb(firstError, firstError ? failedSpans : undefined);
        }
      });
    });
  },

  exportMetrics(payload, cb) {
    connection.sendMetrics(otlpExporter.metrics.transform(payload), cb, targets.metrics);
  }
};

/**
 * @param {import('./config').InstanaConfig} config
 */
function configure(config) {
  const otlpConfig = config.tracing?.otlp;

  if (otlpConfig?.enabled) {
    format = otlpFormat;
    targets = {
      traces: otlpExporter.getExportTarget(otlpConfig, 'traces'),
      logs: otlpExporter.getExportTarget(otlpConfig, 'logs'),
      metrics: otlpExporter.getExportTarget(otlpConfig, 'metrics')
    };
  } else {
    format = instanaFormat;
    targets = null;
  }
}

/**
 * @param {import('./config').InstanaConfig} config
 * @param {import('.').DownstreamConnection} downstreamConnection
 */
exports.init = function init(config, downstreamConnection) {
  logger = config.logger;
  connection = downstreamConnection;
  configure(config);
};

/**
 * The format can change after init, because the agent can send configuration.
 * @param {import('./config').InstanaConfig} config
 */
exports.activate = function activate(config) {
  configure(config);
};

/**
 * @param {InstanaSpans} spans
 * @param {ExportCallback} cb
 */
exports.exportSpans = function exportSpans(spans, cb) {
  format.exportSpans(spans, cb);
};

/**
 * @param {InstanaSpans} spans
 * @returns {any}
 */
exports.transformSpans = function transformSpans(spans) {
  return format.transformSpans(spans);
};

/**
 * @param {Object<string, *>} payload
 * @param {(...args: *) => *} cb
 */
exports.exportMetrics = function exportMetrics(payload, cb) {
  format.exportMetrics(payload, cb);
};
