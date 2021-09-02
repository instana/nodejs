/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
const { backendConnector: instanaBackendConnector, environment: instanaEnvironment } = require('@instana/serverless');
// TODO: add these constants to the constant module
const instanaEndpointUrlEnvVar = 'INSTANA_ENDPOINT_URL';
const instanaAgentKeyEnvVar = 'INSTANA_AGENT_KEY';

/**
 * The exporter is based on the parser from the Agent:
 * https://github.com/instana/agent/blob/51da097e99e9d05ac5c0b5b7dd9275a12c20685d/agent-optional-parent/agent-open-telemetry/src/main/java/com/instana/agent/main/impl/otel/OpenTelemetryTraceEndpoint.java#L69
 */

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
const STATUS_UNSET = 0;
const STATUS_OK = 1;
const STATUS_ERROR = 2;

const statusAsString = {
  2: 'ERROR',
  1: 'OK',
  0: 'UNSET'
};

export class InstanaExporter implements SpanExporter {

  constructor(agentKey?: string, endpointUrl?: string) {

    // If endpoint URL and agent key are not provided, we don't set them in an attempt to use env vars, if they were set
    if (endpointUrl) {
      process.env[instanaEndpointUrlEnvVar] = endpointUrl;
    }

    if (agentKey) {
      process.env[instanaAgentKeyEnvVar] = agentKey;
    }

    instanaEnvironment.validate();
    instanaBackendConnector.init();
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const validSpans = spans.map(this._transform.bind(this));
    this._sendSpans(validSpans, resultCallback);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  private _sendSpans(spans: any[], resultCallback: (result: ExportResult) => void) {
    instanaBackendConnector.sendSpans(spans,  (err: any, _responseBody?: string) => {
      let result: ExportResult = { code: ExportResultCode.SUCCESS };
      if (err) {
        console.log('error', err);
        result = { code: ExportResultCode.FAILED, error: err };
      }
      resultCallback(result);
    });
  }

  private _transform(span: ReadableSpan): any {

    let result: { [key: string]: any } = {
      n: 'otel',
      f: {
        e: process.pid
      },
      data: {}
    };

    const traceId = this._buildTraceOrSpanId(span.spanContext().traceId, true);

    if (traceId.length === 32) {
      result.t = traceId.substr(16);
    } else {
      result.t = traceId;
    }

    const hasParent = typeof span.parentSpanId === 'string' && span.parentSpanId.length > 0;

    if (hasParent) {
      result.p = this._buildTraceOrSpanId(span.parentSpanId as string);
    }
    
    result.s = this._buildTraceOrSpanId(span.spanContext().spanId);
    result.ts = span.startTime[0] * 1000;
    result.d = (span.endTime[0] - span.startTime[0]) * 1000;

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
      // TODO: should we stringify and parse this guy?
      result.data.trace_state = span.spanContext().traceState;
    }

    result.data.tags = { ...span.attributes };

    if (span.events) {
      result.data.events = span.events.slice();
    }

    if (span.status) {
      if (span.status.code === STATUS_OK) {
        result.ec = 0;
      } else {
        result.ec = 1;
        result.data.error = statusAsString[span.status.code] || 'UNSET';
        result.data.error_detail = span.status.message;
      }
    }

    return result;
  }

  private _buildTraceOrSpanId(spanId: string, isTraceId = false): string {
    const len = isTraceId ? 16 : 8;
    let result = spanId;

    // TODO: to use actual bytes instead of string only.

    if (spanId.length < len ) {
      const difference = len - spanId.length;
      const pad = Array(difference + 1).join('0');
      result = `${pad}${spanId}`;
    }
    return result;
  }
}
