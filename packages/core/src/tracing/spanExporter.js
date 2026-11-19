/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const instanaBackendMapper = require('./backend_mappers');
const otlpExporter = require('../otlpExporter');

/**
 * The span exporter sits between the span buffer and the downstream connection:
 *
 *   spanBuffer (buffering, batching, retry)
 *        |   export(spans, cb)
 *   spanExporter (wire format, signal splitting, dispatch)
 *        |   sendSpans(payload, cb) / sendLogs(payload, cb)
 *   downstream connection (agentConnection, serverless backend_connector: routing & transport only)
 *
 * The span buffer does not know anything about the wire format. A downstream connection does not know anything about
 * span internals. Adding another export format means adding another exporter here, nothing else has to change.
 *
 * @typedef {Array<import('../core').InstanaBaseSpan>} InstanaSpans
 * @typedef {(error?: Error, failedSpans?: InstanaSpans) => void} ExportCallback
 *
 * @typedef {Object} Exporter
 * @property {(spans: InstanaSpans, cb: ExportCallback) => void} export
 *   Transforms and sends the spans. The callback is called exactly once. If anything could not be sent, it receives the
 *   (internal format) spans that need to be retried.
 * @property {(spans: InstanaSpans) => any} transform
 *   Transforms the spans into the trace payload without sending it (used when the spans are shipped as a bundle).
 */

/** @type {import('../core').GenericLogger} */
let logger;
/** @type {import('..').DownstreamConnection} */
let connection;
/** @type {Exporter} */
let exporter;
/** @type {import('../config').InstanaConfig['tracing']['otlp']} */
let otlpConfig;

/** @type {Exporter} */
const instanaFormatExporter = {
  transform(spans) {
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

  export(spans, cb) {
    connection.sendSpans(instanaFormatExporter.transform(spans), (/** @type {Error} */ error) => {
      cb(error, error ? spans : undefined);
    });
  }
};

/** @type {Exporter} */
const otlpFormatExporter = {
  transform(spans) {
    // Log spans are exported as a separate signal and are not part of the OTLP traces payload.
    return otlpExporter.traces.transform(otlpExporter.splitSignals(spans).traceSpans);
  },

  export(spans, cb) {
    const { traceSpans, logSpans } = otlpExporter.splitSignals(spans);

    /** @type {Array<{ spans: InstanaSpans, send: (done: (error?: Error) => void) => void }>} */
    const signals = [];

    // The exporter is the only place that knows about OTLP. It tells the connection where to deliver the payload,
    // the connection does not need to know what the payload is.
    if (traceSpans.length > 0) {
      signals.push({
        spans: traceSpans,
        send: done =>
          connection.sendSpans(
            otlpExporter.traces.transform(traceSpans),
            done,
            otlpExporter.getExportTarget(otlpConfig, 'traces')
          )
      });
    }

    if (logSpans.length > 0) {
      if (typeof connection.sendLogs === 'function') {
        signals.push({
          spans: logSpans,
          send: done =>
            connection.sendLogs(
              otlpExporter.logs.transform(logSpans),
              done,
              otlpExporter.getExportTarget(otlpConfig, 'logs')
            )
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
  }
};

/**
 * @param {import('../config').InstanaConfig} config
 */
function select(config) {
  otlpConfig = config.tracing?.otlp;
  exporter = otlpConfig?.enabled ? otlpFormatExporter : instanaFormatExporter;
}

/**
 * @param {import('../config').InstanaConfig} config
 * @param {import('..').DownstreamConnection} downstreamConnection
 */
exports.init = function init(config, downstreamConnection) {
  logger = config.logger;
  connection = downstreamConnection;
  select(config);
};

/**
 * The export format can change between init and activate.
 * @param {import('../config').InstanaConfig} config
 */
exports.activate = function activate(config) {
  select(config);
};

/**
 * @param {InstanaSpans} spans
 * @param {ExportCallback} cb
 */
exports.export = function exportSpans(spans, cb) {
  exporter.export(spans, cb);
};

/**
 * @param {InstanaSpans} spans
 * @returns {any}
 */
exports.transform = function transform(spans) {
  return exporter.transform(spans);
};
