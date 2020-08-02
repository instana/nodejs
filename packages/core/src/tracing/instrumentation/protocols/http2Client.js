'use strict';

var semver = require('semver');

var cls = require('../../cls');
var constants = require('../../constants');
var httpCommon = require('./_http');
var readSymbolProperty = require('../../../util/readSymbolProperty');
var tracingUtil = require('../../tracingUtil');
var urlUtil = require('../../../util/url');

var discardUrlParameters = urlUtil.discardUrlParameters;
var filterParams = urlUtil.filterParams;

var extraHttpHeadersToCapture;
var isActive = false;

var originS = 'Symbol(origin)';
var sentHeadersS = 'Symbol(sent-headers)';
var HTTP2_HEADER_METHOD;
var HTTP2_HEADER_PATH;
var HTTP2_HEADER_STATUS;

exports.init = function(config) {
  if (semver.gte(process.versions.node, '8.4.0')) {
    var http2 = require('http2');
    HTTP2_HEADER_METHOD = http2.constants.HTTP2_HEADER_METHOD;
    HTTP2_HEADER_PATH = http2.constants.HTTP2_HEADER_PATH;
    HTTP2_HEADER_STATUS = http2.constants.HTTP2_HEADER_STATUS;
    instrument(http2);
  }
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.updateConfig = function(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

function instrument(coreModule) {
  var originalConnect = coreModule.connect;
  coreModule.connect = function connect() {
    var clientHttp2Session = originalConnect.apply(this, arguments);
    instrumentClientHttp2Session(clientHttp2Session);
    return clientHttp2Session;
  };
}

function instrumentClientHttp2Session(clientHttp2Session) {
  var originalRequest = clientHttp2Session.request;
  clientHttp2Session.request = function request(headers) {
    var parentSpan = cls.getCurrentSpan() || cls.getReducedSpan();
    var w3cTraceContext = cls.getW3cTraceContext();

    if (!isActive || !parentSpan || constants.isExitSpan(parentSpan)) {
      if (cls.tracingSuppressed()) {
        addTraceLevelHeader(headers, '0', w3cTraceContext);
      }
      return originalRequest.apply(this, arguments);
    }

    var originalThis = this;
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return cls.ns.runAndReturn(function() {
      var span = cls.startSpan('node.http.client', constants.EXIT);

      addHeaders(headers, span, w3cTraceContext);

      var stream = originalRequest.apply(originalThis, originalArgs);

      var origin = readSymbolProperty(stream, originS);
      var reqHeaders = readSymbolProperty(stream, sentHeadersS);
      var capturedHeaders = httpCommon.getExtraHeadersCaseInsensitive(reqHeaders, extraHttpHeadersToCapture);

      var method;
      var path;
      var status;
      if (reqHeaders) {
        method = reqHeaders[HTTP2_HEADER_METHOD];
        path = reqHeaders[HTTP2_HEADER_PATH];
      }
      method = method || 'GET';
      path = path || '/';

      var pathWithoutQuery = discardUrlParameters(path);
      var params = splitAndFilter(path);

      span.stack = tracingUtil.getStackTrace(request);

      span.data.http = {
        method: method,
        url: origin + pathWithoutQuery,
        params: params
      };

      stream.on('response', function(resHeaders) {
        status = resHeaders[HTTP2_HEADER_STATUS];
        capturedHeaders = httpCommon.mergeExtraHeadersFromHeaders(
          capturedHeaders,
          resHeaders,
          extraHttpHeadersToCapture
        );
      });

      stream.on('end', function() {
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

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};

exports.setExtraHttpHeadersToCapture = function setExtraHttpHeadersToCapture(_extraHeaders) {
  extraHttpHeadersToCapture = _extraHeaders;
};

function splitAndFilter(path) {
  var parts = path.split('?');
  if (parts.length >= 2) {
    return filterParams(parts[1]);
  }
  return null;
}
