'use strict';

var coreHttpModule = require('http');
var url = require('url');

var tracingConstants = require('../constants');
var transmission = require('../transmission');
var hook = require('../hook');

var originalRequest = coreHttpModule.request;

var isActive = false;

exports.init = function() {
  coreHttpModule.request = function request(opts, givenResponseListener) {
    var uid = hook.initAndPreSimulated();
    var tracingSuppressed = hook.isTracingSuppressed(uid);
    var traceId = hook.getTraceId(uid);
    var clientRequest;

    if (!isActive || tracingSuppressed || hook.containsExitSpan(uid) || traceId == null) {
      clientRequest = originalRequest.apply(coreHttpModule, arguments);

      if (tracingSuppressed) {
        clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '0');
      }

      return clientRequest;
    }

    hook.markAsExitSpan(uid);

    var span = {
      s: hook.generateRandomSpanId(),
      t: traceId,
      p: hook.getParentSpanId(uid),
      f: hook.getFrom(),
      async: false,
      error: false,
      ts: Date.now(),
      d: 0,
      n: 'node.http.client',
      data: null
    };
    hook.setSpanId(uid, span.s);

    var responseListener = function responseListener(res) {
      var parsedUrl = url.parse(clientRequest.path);
      span.data = {
        http: {
          method: clientRequest.method,
          url: parsedUrl.pathname,
          status: res.statusCode
        }
      };
      span.d = Date.now() - span.ts;
      span.error = res.statusCode >= 500;
      transmission.addSpan(span);
      hook.postAndDestroySimulated(uid);

      if (givenResponseListener) {
        givenResponseListener(res);
      }
    };

    try {
      clientRequest = originalRequest.call(coreHttpModule, opts, responseListener);
    } catch (e) {
      // synchronous exceptions normally indicate failures that are not covered by the
      // listeners. Cleanup immediately.
      hook.postAndDestroySimulated(uid);
      throw e;
    }

    clientRequest.setHeader(tracingConstants.spanIdHeaderName, span.s);
    clientRequest.setHeader(tracingConstants.traceIdHeaderName, span.t);

    clientRequest.addListener('timeout', function() {
      var parsedUrl = url.parse(clientRequest.path);
      span.data = {
        http: {
          method: clientRequest.method,
          url: parsedUrl.pathname,
          error: 'Timeout exceeded'
        }
      };
      span.d = Date.now() - span.ts;
      span.error = true;
      transmission.addSpan(span);
      hook.postAndDestroySimulated(uid);
    });

    clientRequest.addListener('error', function(err) {
      try {
        var parsedUrl = url.parse(clientRequest.path);
      } catch (e) {
        // do not break the application on invalid requests
        return;
      }

      span.data = {
        http: {
          method: clientRequest.method,
          url: parsedUrl.pathname,
          error: err.message
        }
      };
      span.d = Date.now() - span.ts;
      span.error = true;
      transmission.addSpan(span);
      hook.postAndDestroySimulated(uid);
    });

    return clientRequest;
  };
};


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
