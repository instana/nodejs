/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const semver = require('semver');

const cls = require('../../cls');
const constants = require('../../constants');
const httpCommon = require('./_http');
const readSymbolProperty = require('../../../util/readSymbolProperty');
const tracingUtil = require('../../tracingUtil');
const { filterParams, sanitizeUrl } = require('../../../util/url');

let extraHttpHeadersToCapture;
let isActive = false;

const originS = 'Symbol(origin)';
const sentHeadersS = 'Symbol(sent-headers)';
let HTTP2_HEADER_METHOD;
let HTTP2_HEADER_PATH;
let HTTP2_HEADER_STATUS;

exports.init = function init(config) {
  if (semver.gte(process.versions.node, '8.8.0')) {
    const http2 = require('http2');
    HTTP2_HEADER_METHOD = http2.constants.HTTP2_HEADER_METHOD;
    HTTP2_HEADER_PATH = http2.constants.HTTP2_HEADER_PATH;
    HTTP2_HEADER_STATUS = http2.constants.HTTP2_HEADER_STATUS;
    instrument(http2);
  }
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.updateConfig = config => {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
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
    const parentSpan = cls.getCurrentSpan() || cls.getReducedSpan();

    if (!isActive || !parentSpan || constants.isExitSpan(parentSpan)) {
      if (cls.tracingSuppressed()) {
        addTraceLevelHeader(headers, '0', w3cTraceContext);
      }
      return originalRequest.apply(this, arguments);
    }

    const originalThis = this;
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan('node.http.client', constants.EXIT);

      // startSpan updates the W3C trace context and writes it back to CLS, so we have to refetch the updated context
      // object from CLS.
      w3cTraceContext = cls.getW3cTraceContext();

      addHeaders(headers, span, w3cTraceContext);

      const stream = originalRequest.apply(originalThis, originalArgs);

      const origin = readSymbolProperty(stream, originS);
      const reqHeaders = readSymbolProperty(stream, sentHeadersS);
      let capturedHeaders = httpCommon.getExtraHeadersCaseInsensitive(reqHeaders, extraHttpHeadersToCapture);

      let method;
      let path;
      let status;
      if (reqHeaders) {
        method = reqHeaders[HTTP2_HEADER_METHOD];
        path = reqHeaders[HTTP2_HEADER_PATH];
      }
      method = method || 'GET';
      path = path || '/';

      const pathWithoutQuery = sanitizeUrl(path);
      const params = splitAndFilter(path);

      span.stack = tracingUtil.getStackTrace(request);

      span.data.http = {
        method,
        url: origin + pathWithoutQuery,
        params
      };

      stream.on('response', resHeaders => {
        status = resHeaders[HTTP2_HEADER_STATUS];
        capturedHeaders = httpCommon.mergeExtraHeadersFromHeaders(
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

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

exports.setExtraHttpHeadersToCapture = function setExtraHttpHeadersToCapture(_extraHeaders) {
  extraHttpHeadersToCapture = _extraHeaders;
};

function splitAndFilter(path) {
  const parts = path.split('?');
  if (parts.length >= 2) {
    return filterParams(parts[1]);
  }
  return null;
}
