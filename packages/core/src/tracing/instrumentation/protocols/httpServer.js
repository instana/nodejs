'use strict';

var coreHttpsModule = require('https');
var coreHttpModule = require('http');

var constants = require('../../constants');
var urlUtil = require('../../../util/url');
var httpCommon = require('./_http');
var shimmer = require('shimmer');
var cls = require('../../cls');

var discardUrlParameters = urlUtil.discardUrlParameters;
var filterParams = urlUtil.filterParams;

var extraHttpHeadersToCapture;
var isActive = false;

exports.spanName = 'node.http.server';

exports.init = function(config) {
  shimmer.wrap(coreHttpModule.Server && coreHttpModule.Server.prototype, 'emit', shimEmit);
  shimmer.wrap(coreHttpsModule.Server && coreHttpsModule.Server.prototype, 'emit', shimEmit);
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.updateConfig = function(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

function shimEmit(realEmit) {
  return function(type, req, res) {
    if (type !== 'request' || !isActive) {
      return realEmit.apply(this, arguments);
    }

    var originalThis = this;
    var originalArgs = arguments;

    return cls.ns.runAndReturn(function() {
      if (req && req.on && req.addListener && req.emit) {
        cls.ns.bindEmitter(req);
      }
      if (res && res.on && res.addListener && res.emit) {
        cls.ns.bindEmitter(res);
      }

      // Respect any incoming tracing level headers
      if (req && req.headers && req.headers[constants.traceLevelHeaderNameLowerCase] === '0') {
        cls.setTracingLevel(req.headers[constants.traceLevelHeaderNameLowerCase]);
      }

      if (cls.tracingSuppressed()) {
        return realEmit.apply(originalThis, originalArgs);
      }

      var incomingTraceId = getExistingTraceId(req);
      var incomingParentSpanId = getExistingSpanId(req);
      var span = cls.startSpan(exports.spanName, constants.ENTRY, incomingTraceId, incomingParentSpanId);

      // Grab the URL before application code gets access to the incoming message.
      // We are doing this because libs like express are manipulating req.url when
      // using routers.
      var urlParts = req.url.split('?');
      if (urlParts.length >= 1) {
        urlParts[1] = filterParams(urlParts[1]);
      }
      span.data.http = {
        method: req.method,
        url: discardUrlParameters(urlParts.shift()),
        params: urlParts.join('?'),
        host: req.headers.host,
        header: httpCommon.getExtraHeaders(req, extraHttpHeadersToCapture)
      };
      var incomingServiceName =
        span.data.http.header && span.data.http.header[constants.serviceNameHeaderNameLowerCase];
      if (incomingServiceName != null) {
        span.data.service = incomingServiceName;
      }

      // Handle client / backend eum correlation.
      if (!span.p) {
        req.headers['x-instana-t'] = span.t;

        // support for automatic client/back end EUM correlation
        // intid = instana trace id
        // This abbreviation is small enough to not incur a notable overhead while at the same
        // time being unique enough to avoid name collisions.
        var serverTimingValue = 'intid;desc=' + span.t;
        res.setHeader('Server-Timing', serverTimingValue);
        shimmer.wrap(res, 'setHeader', function(realSetHeader) {
          return function shimmedSetHeader(key, value) {
            if (key.toLowerCase() === 'server-timing') {
              if (Array.isArray(value)) {
                return realSetHeader.call(this, key, value.concat(serverTimingValue));
              }
              return realSetHeader.call(this, key, value + ', ' + serverTimingValue);
            }
            return realSetHeader.apply(this, arguments);
          };
        });
      }

      req.on('aborted', function() {
        finishSpan();
      });

      res.on('finish', function() {
        finishSpan();
      });

      res.on('close', function() {
        // This is purely a safe guard: in all known scenarios, one of the other events that finishes the HTTP entry
        // span should have been called before (res#finish or req#aborted).
        finishSpan();
      });

      function finishSpan() {
        // Check if a span with higher priority (like graphql.server) already finished this span, only overwrite
        // span attributes if that is not the case.
        if (!span.transmitted) {
          // safe guard just in case a higher prio instrumentation (graphql etc.) has removed data.http (planning to
          // take over the span) but did not actually transmit this span.
          span.data.http = span.data.http || {};
          span.data.http.status = res.statusCode;
          span.data.http.header = httpCommon.mergeExtraHeaders(span.data.http.header, res, extraHttpHeadersToCapture);
          span.error = res.statusCode >= 500;
          span.ec = span.error ? 1 : 0;
          span.d = Date.now() - span.ts;
          span.transmit();
        }
      }

      return realEmit.apply(originalThis, originalArgs);
    });
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};

function getExistingSpanId(req) {
  var spanId = req.headers[constants.spanIdHeaderNameLowerCase];
  if (spanId == null) {
    return null;
  }
  return spanId;
}

function getExistingTraceId(req) {
  var traceId = req.headers[constants.traceIdHeaderNameLowerCase];
  if (traceId == null) {
    return null;
  }
  return traceId;
}

exports.setExtraHttpHeadersToCapture = function setExtraHttpHeadersToCapture(_extraHeaders) {
  extraHttpHeadersToCapture = _extraHeaders;
};
