'use strict';

var coreHttpModule = require('http');
var url = require('url');

var tracingConstants = require('../constants');
var transmission = require('../transmission');
var hook = require('../hook');

var originalCreateServer = coreHttpModule.createServer;

var isActive = false;

exports.init = function() {
  coreHttpModule.createServer = function createServer(givenRequestListener) {
    var actualRequestListener = givenRequestListener == null ? requestListener : function(req, res) {
      requestListener(req, res);
      givenRequestListener(req, res);
    };

    var server = originalCreateServer.call(coreHttpModule, actualRequestListener);

    return server;
  };
};


function requestListener(req, res) {
  if (!isActive) {
    return;
  }

  var uid = hook.getCurrentUid();
  if (req.headers[tracingConstants.traceLevelHeaderNameLowerCase] === '0') {
    hook.setTracingSuppressed(uid, true);
    return;
  }

  hook.setTracingSuppressed(uid, false);

  var spanId = hook.generateRandomSpanId();
  var traceId = getExistingTraceId(req, spanId);
  var span = {
    s: spanId,
    t: traceId,
    p: getExistingSpanId(req),
    f: hook.getFrom(),
    async: false,
    error: false,
    ec: 0,
    ts: Date.now(),
    d: 0,
    n: 'node.http.server',
    stack: [],
    data: null
  };
  hook.setSpanId(uid, spanId);
  hook.setTraceId(uid, traceId);

  // Handle client / backend eum correlation.
  if (spanId === traceId) {
    req.headers['x-instana-t'] = traceId;
  }

  var parsedUrl = url.parse(req.url);

  res.on('finish', function() {
    span.data = {
      http: {
        method: req.method,
        url: parsedUrl.pathname,
        status: res.statusCode,
        host: req.headers.host
      }
    };
    span.error = res.statusCode >= 500;
    span.ec = span.error ? 1 : 0;
    span.d = Date.now() - span.ts;
    transmission.addSpan(span);
  });
}


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};


function getExistingSpanId(req, fallback) {
  fallback = arguments.length > 1 ? fallback : null;

  var spanId = req.headers[tracingConstants.spanIdHeaderNameLowerCase];
  if (spanId == null) {
    return fallback;
  }

  return spanId;
}


function getExistingTraceId(req, fallback) {
  fallback = arguments.length > 1 ? fallback : null;

  var traceId = req.headers[tracingConstants.traceIdHeaderNameLowerCase];
  if (traceId == null) {
    return fallback;
  }

  return traceId;
}
