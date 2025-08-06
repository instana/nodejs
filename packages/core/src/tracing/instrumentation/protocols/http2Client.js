/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const http2 = require('http2');

const cls = require('../../cls');
const constants = require('../../constants');
const {
  getExtraHeadersCaseInsensitive,
  mergeExtraHeadersFromNormalizedObjectLiteral
} = require('./captureHttpHeadersUtil');
const readSymbolProperty = require('../../../util/readSymbolProperty');
const tracingUtil = require('../../tracingUtil');
const { sanitizeUrl, splitAndFilter } = require('../../../util/url');

let extraHttpHeadersToCapture;
let isActive = false;

const originS = 'Symbol(origin)';
const sentHeadersS = 'Symbol(sent-headers)';
const HTTP2_HEADER_METHOD = http2.constants.HTTP2_HEADER_METHOD;
const HTTP2_HEADER_PATH = http2.constants.HTTP2_HEADER_PATH;
const HTTP2_HEADER_STATUS = http2.constants.HTTP2_HEADER_STATUS;

exports.init = function init(config) {
  instrument(http2);
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.updateConfig = config => {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.activate = function activate(extraConfig) {
  if (
    extraConfig &&
    extraConfig.tracing &&
    extraConfig.tracing.http &&
    Array.isArray(extraConfig.tracing.http.extraHttpHeadersToCapture)
  ) {
    extraHttpHeadersToCapture = extraConfig.tracing.http.extraHttpHeadersToCapture;
  }
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function instrument(coreModule) {
  const originalConnect = coreModule.connect;
  coreModule.connect = function connect() {
    const clientHttp2Session = originalConnect.apply(this, arguments);
    instrumentClientHttp2Session(clientHttp2Session);
    return clientHttp2Session;
  };
}

function instrumentClientHttp2Session(clientHttp2Session) {
  const originalRequest = clientHttp2Session.request;
  clientHttp2Session.request = function request(headers) {
    let w3cTraceContext = cls.getW3cTraceContext();

    const skipTracingResult = cls.skipExitTracing({
      isActive,
      extendedResponse: true,
      checkReducedSpan: true
    });

    if (skipTracingResult.skip) {
      if (skipTracingResult.suppressed) {
        addTraceLevelHeader(headers, '0', w3cTraceContext);
      }

      return originalRequest.apply(this, arguments);
    }

    const parentSpan = skipTracingResult.parentSpan;

    const originalThis = this;
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    let method;
    let path;
    method = method || 'GET';
    path = path || '/';

    /**
     * Although the HTTP span ignoring feature currently applies only to entry spans (phase 1),
     * both server and client spans share the same span.data.http structure.
     *
     * To maintain consistency and prepare for future support of exit spans (phase 2),
     * we're applying the transformation logic to both entry and exit spans now.
     * This ensures structural alignment and avoids duplicating effort later.
     *
     * Note: The HTTP method and other related fields are captured later during request processing.
     * Since span ignoring is limited to entry spans at this stage, setting data for exit spans here is safe.
     * This logic will be further refined in upcoming iterations.
     */
    const spanData = {
      http: {
        operation: method,
        endpoints: ''
      }
    };
    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: 'node.http.client',
        kind: constants.EXIT,
        traceId: parentSpan?.t,
        parentSpanId: parentSpan?.s,
        spanData
      });

      // startSpan updates the W3C trace context and writes it back to CLS, so we have to refetch the updated context
      // object from CLS.
      w3cTraceContext = cls.getW3cTraceContext();

      addHeaders(headers, span, w3cTraceContext);

      const stream = originalRequest.apply(originalThis, originalArgs);

      const origin = readSymbolProperty(stream, originS);
      const reqHeaders = readSymbolProperty(stream, sentHeadersS);
      let capturedHeaders = getExtraHeadersCaseInsensitive(reqHeaders, extraHttpHeadersToCapture);

      let status;
      if (reqHeaders) {
        method = reqHeaders[HTTP2_HEADER_METHOD];
        path = reqHeaders[HTTP2_HEADER_PATH];
      }

      span.stack = tracingUtil.getStackTrace(request);
      const pathWithoutQuery = sanitizeUrl(path);
      const params = splitAndFilter(path);

      span.data.http.operation = method;
      span.data.http.endpoints = origin + pathWithoutQuery;
      span.data.http.params = params;

      stream.on('response', resHeaders => {
        status = resHeaders[HTTP2_HEADER_STATUS];
        capturedHeaders = mergeExtraHeadersFromNormalizedObjectLiteral(
          capturedHeaders,
          resHeaders,
          extraHttpHeadersToCapture
        );
      });

      stream.on('end', () => {
        span.d = Date.now() - span.ts;
        span.ec = status >= 500 ? 1 : 0;
        span.data.http.status = status;
        if (capturedHeaders) {
          span.data.http.header = capturedHeaders;
        }
        span.transmit();
      });

      return stream;
    });
  };
}

function addTraceLevelHeader(headers, level, w3cTraceContext) {
  if (!headers) {
    return;
  }
  headers[constants.traceLevelHeaderName] = level;
  addW3cHeaders(headers, w3cTraceContext);
}

function addHeaders(headers, span, w3cTraceContext) {
  if (!headers) {
    return;
  }
  headers[constants.spanIdHeaderName] = span.s;
  headers[constants.traceIdHeaderName] = span.t;
  headers[constants.traceLevelHeaderName] = '1';
  addW3cHeaders(headers, w3cTraceContext);
}

function addW3cHeaders(headers, w3cTraceContext) {
  if (w3cTraceContext) {
    headers[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();
    if (w3cTraceContext.hasTraceState()) {
      headers[constants.w3cTraceState] = w3cTraceContext.renderTraceState();
    }
  }
}
