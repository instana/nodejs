/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const {
  backendConnector: instanaBackendConnector,
  environment: instanaEnvironment,
  consoleLogger: log
} = require('@instana/serverless');
const { ExportResultCode } = require('@opentelemetry/core');
const { diag } = require('@opentelemetry/api');

// NOTE: Use the Opentelemetry logger.
const logger = log.init({ logger: diag });
const instanaEndpointUrlEnvVar = 'INSTANA_ENDPOINT_URL';
const instanaAgentKeyEnvVar = 'INSTANA_AGENT_KEY';

/** @typedef {import('@opentelemetry/sdk-trace-base').ReadableSpan} ReadableSpan */
/** @typedef {import('@instana/core/src/core').InstanaBaseSpan} InstanaBaseSpan */

/** Span Kind
  Default value. Indicates that the span is used internally.
  INTERNAL = 0,

  Indicates that the span covers server-side handling of an RPC or other
  remote request.
  SERVER = 1,

  Indicates that the span covers the client-side wrapper around an RPC or
  other remote request.
  CLIENT = 2,

  Indicates that the span describes producer sending a message to a
  broker. Unlike client and server, there is no direct critical path latency
  relationship between producer and consumer spans.
  PRODUCER = 3,

  Indicates that the span describes consumer receiving a message from a
  broker. Unlike client and server, there is no direct critical path latency
  relationship between producer and consumer spans.
  CONSUMER = 4
*/
const SPAN_KIND_INTERNAL = 0;
const SPAN_KIND_SERVER = 1;
const SPAN_KIND_CLIENT = 2;
const SPAN_KIND_PRODUCER = 3;
const SPAN_KIND_CONSUMER = 4;
const SERVER_KIND = 'server';
const CLIENT_KIND = 'client';
const PRODUCER_KIND = 'producer';
const CONSUMER_KIND = 'consumer';
const INTERNAL_KIND = 'internal';
/**
 * https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto#L314
 * Status Code
 *
 * Default
 * UNSET = 0,
 * The operation has been validated by an Application developer or
 * Operator to have completed successfully.
 * OK = 1,
 * The operation contains an error.
 * ERROR = 2
 */

const DEPRECATED_STATUS_CODE_OK = 0;
const STATUS_UNSET = 0;
const STATUS_OK = 1;
// const STATUS_ERROR = 2;

class InstanaExporter {
  /**
   * @param {{ agentKey?: string, endpointUrl?: string }}
   */
  constructor({ agentKey, endpointUrl } = {}) {
    this._isShutdown = true;

    // https://github.com/open-telemetry/opentelemetry-js/pull/3627
    // NOTE: We are not using the Instana logger. We are using Otel API diag component.
    // NOTE: We accept for `process.env.INSTANA_DEBUG` any string value - does not have to be "true".
    if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
      process.env.OTEL_LOG_LEVEL = process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL;
    }

    // If endpoint URL and agent key are not provided, we don't set them in an attempt to use env vars, if they were set
    if (endpointUrl) {
      process.env[instanaEndpointUrlEnvVar] = endpointUrl;
    }
    if (agentKey) {
      process.env[instanaAgentKeyEnvVar] = agentKey;
    }

    instanaEnvironment.init({ logger });
    instanaEnvironment.validate();

    if (instanaEnvironment.isValid()) {
      instanaBackendConnector.init({ config: { logger }, stopSendingOnFailure: false });
      this._isShutdown = false;
    }
  }

  /**
   * @param {Array.<ReadableSpan>} spans
   * @param {(result: import('@opentelemetry/core').ExportResult) => void} resultCallback
   */
  export(spans, resultCallback) {
    diag.debug(`Instana: received ${spans.length} spans from Opentelemetry.`);

    if (this._isShutdown) {
      setImmediate(() => {
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error('Instana Exporter has been shutdown')
        });
      });
      return;
    }

    const instanaSpans = spans.map(this._transform.bind(this));
    this._sendSpans(instanaSpans, resultCallback);
  }

  /**
   * @returns {Promise.<void>}
   */
  shutdown() {
    /**
     * In the future, there may be the need to "end" any kind of process or network communications with our backend.
     * Right now, there isn't seem to be any situation where we need that, as we simply make HTTP requests without
     * actually making any type of stateful or persistent connections.
     */
    this._isShutdown = true;
    return Promise.resolve();
  }

  /**
   * @param {Array.<InstanaBaseSpan>} spans
   * @param {(result: import('@opentelemetry/core').ExportResult) => void} resultCallback
   */
  _sendSpans(spans, resultCallback) {
    try {
      instanaBackendConnector.sendSpans(spans, (err /* , _responseBody */) => {
        /** @type {import('@opentelemetry/core').ExportResult} */
        let result = { code: ExportResultCode.SUCCESS };
        if (err) {
          result = { code: ExportResultCode.FAILED, error: err };
        }
        resultCallback(result);
      });
    } catch (spansSendingError) {
      resultCallback({ code: ExportResultCode.FAILED, error: spansSendingError });
    }
  }

  /**
   * @param {ReadableSpan} span
   * @returns {InstanaBaseSpan}
   */
  _transform(span) {
    /** @type {import('@instana/core/src/core').InstanaBaseSpan} */
    const result = {
      n: 'otel',
      f: {
        e: process.pid
      },
      data: {}
    };

    const traceId = this._buildTraceOrSpanId(span.spanContext().traceId, true);

    if (traceId.length === 32) {
      result.t = traceId.substr(16);
      result.lt = traceId;
    } else {
      result.t = traceId;
    }

    const hasParent = typeof span.parentSpanId === 'string' && span.parentSpanId.length > 0;

    if (hasParent) {
      result.p = this._buildTraceOrSpanId(span.parentSpanId);
    }

    result.s = this._buildTraceOrSpanId(span.spanContext().spanId);
    result.ts = this._getTimeInMilliseconds(span.startTime);
    result.d = this._getTimeInMilliseconds(span.duration);
    let isEntrySpan = false;

    switch (span.kind) {
      case SPAN_KIND_SERVER:
        isEntrySpan = true;
        result.data.kind = SERVER_KIND;
        break;
      case SPAN_KIND_CLIENT:
        result.data.kind = CLIENT_KIND;
        break;
      case SPAN_KIND_PRODUCER:
        result.data.kind = PRODUCER_KIND;
        break;
      case SPAN_KIND_CONSUMER:
        isEntrySpan = true;
        result.data.kind = CONSUMER_KIND;
        break;
      case SPAN_KIND_INTERNAL:
        result.data.kind = INTERNAL_KIND;
        break;
      default:
        break;
    }

    if (hasParent && isEntrySpan) {
      // If an OTel entry span continues an ongoing trace (which is equivalent to the original span having a parent), it
      // always uses the IDs from the traceparent header, thus we mark the span with span.tp accordingly.
      result.tp = true;
    }

    result.data.service = span.resource && span.resource.attributes && span.resource.attributes['service.name'];
    result.data.operation = span.name;

    if (span.spanContext().traceState) {
      result.data.trace_state = span.spanContext().traceState;
    }

    result.data.tags = Object.assign({}, span.attributes);
    if (span.events) {
      result.data.events = span.events.slice();
    }

    // Rules regarding status code according to the spec:
    // https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto#L264
    //
    // 3. New receivers MUST look at both the `code` and `deprecated_code` fields in order
    // to interpret the overall status:
    //
    //   If code==STATUS_CODE_UNSET then the value of `deprecated_code` is the
    //   carrier of the overall status according to these rules:
    //
    //     if deprecated_code==DEPRECATED_STATUS_CODE_OK then the receiver MUST interpret
    //     the overall status to be STATUS_CODE_UNSET.
    //
    //     if deprecated_code!=DEPRECATED_STATUS_CODE_OK then the receiver MUST interpret
    //     the overall status to be STATUS_CODE_ERROR.
    //
    //   If code!=STATUS_CODE_UNSET then the value of `deprecated_code` MUST be
    //   ignored, the `code` field is the sole carrier of the status.

    // Adittionally to these rules, in our tests, deprecated_code / deprecatedCode is never present.
    // In these cases we will assume that only the new code status are present, because these are the status codes
    // present in the interface.

    // At the time that this code was written, the OpenTelemtry StatusCode interface has no "deprecatedCode" or
    // "deprecated_code" property. They may add different ones, which will require us to update the code.
    // However, these values are available in the unit test mocked data.

    if (span.status) {
      // eslint-disable-next-line camelcase
      const { code, deprecatedCode, deprecated_code, message } = span.status;
      // eslint-disable-next-line camelcase
      const deprecatedStatusCode = deprecatedCode || deprecated_code;

      if (code === STATUS_UNSET) {
        if (typeof deprecatedStatusCode === 'undefined' || deprecatedStatusCode === DEPRECATED_STATUS_CODE_OK) {
          result.ec = 0;
        } else {
          result.ec = 1;
          result.data.error = 'ERROR';
          result.data.error_detail = message;
        }
      } else if (code === STATUS_OK) {
        result.ec = 0;
      } else {
        result.ec = 1;
        result.data.error = 'ERROR';
        result.data.error_detail = message;
      }
    }

    return result;
  }

  /**
   * @param {string} spanId
   * @param {boolean} [isTraceId]
   * @returns {string}
   */
  _buildTraceOrSpanId(spanId, isTraceId = false) {
    const stringLen = isTraceId ? 32 : 16;
    let result = spanId;

    if (spanId.length < stringLen) {
      const difference = stringLen - spanId.length;
      const padding = Array(difference + 1).join('0');
      result = `${padding}${spanId}`;
    }

    return result;
  }

  /**
   * Function extracted from here:
   * https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-core/src/common/time.ts#L140
   * @param {Array.<number>} hrTime
   * @returns {number}
   */
  _getTimeInMilliseconds(hrTime) {
    return Math.round(hrTime[0] * 1e3 + hrTime[1] / 1e6);
  }
}

exports.InstanaExporter = InstanaExporter;
