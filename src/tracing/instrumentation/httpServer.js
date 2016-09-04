'use strict';

var logger = require('../../logger').getLogger('tracing/httpServer');

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
  if (req.headers[tracingConstants.traceLevelHeaderName] === '0') {
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
    ts: Date.now(),
    d: 0,
    n: 'node.http.server',
    data: null
  };
  hook.setSpanId(uid, spanId);
  hook.setTraceId(uid, traceId);

  var parsedUrl = url.parse(req.url);

  res.on('finish', function() {
    span.data = {
      http: {
        method: req.method,
        url: parsedUrl.pathname,
        status: res.statusCode
      }
    };
    span.error = res.statusCode >= 500;
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

  var spanId = req.headers[tracingConstants.spanIdHeaderName];
  if (spanId == null) {
    return fallback;
  }

  try {
    return Number(spanId);
  } catch (e) {
    logger.info('Retrieved a Instana tracing span ID which is not a number. Got %s.', spanId);
    return fallback;
  }
}


function getExistingTraceId(req, fallback) {
  fallback = arguments.length > 1 ? fallback : null;

  var traceId = req.headers[tracingConstants.traceIdHeaderName];
  if (traceId == null) {
    return fallback;
  }

  try {
    return Number(traceId);
  } catch (e) {
    logger.info('Retrieved a Instana tracing trace ID which is not a number. Got %s.', traceId);
    return fallback;
  }
}
