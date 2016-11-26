'use strict';

var coreHttpModule = require('http');

var discardUrlParameters = require('../../util/url').discardUrlParameters;
var tracingConstants = require('../constants');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
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

    var completeCallUrl;
    if (typeof(opts) === 'string') {
      completeCallUrl = discardUrlParameters(opts);
    } else {
      completeCallUrl = constructCompleteUrlFromOpts(opts, coreHttpModule);
    }

    var span = {
      s: tracingUtil.generateRandomSpanId(),
      t: traceId,
      p: hook.getParentSpanId(uid),
      f: tracingUtil.getFrom(),
      async: false,
      error: false,
      ec: 0,
      ts: Date.now(),
      d: 0,
      n: 'node.http.client',
      stack: tracingUtil.getStackTrace(request),
      data: null
    };
    hook.setSpanId(uid, span.s);

    var responseListener = function responseListener(res) {
      span.data = {
        http: {
          method: clientRequest.method,
          url: completeCallUrl,
          status: res.statusCode
        }
      };
      span.d = Date.now() - span.ts;
      span.error = res.statusCode >= 500;
      span.ec = span.error ? 1 : 0;
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
    clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '1');

    clientRequest.addListener('timeout', function() {
      span.data = {
        http: {
          method: clientRequest.method,
          url: completeCallUrl,
          error: 'Timeout exceeded'
        }
      };
      span.d = Date.now() - span.ts;
      span.error = true;
      transmission.addSpan(span);
      hook.postAndDestroySimulated(uid);
    });

    clientRequest.addListener('error', function(err) {
      span.data = {
        http: {
          method: clientRequest.method,
          url: completeCallUrl,
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

function constructCompleteUrlFromOpts(options, self) {
  if (options.href) {
    return discardUrlParameters(options.href);
  }

  try {
    var agent = options.agent || self.agent;

    // copy of logic from
    // https://github.com/nodejs/node/blob/master/lib/_http_client.js
    // to support incomplete options with agent specific defaults.
    var protocol = options.protocol || (agent && agent.protocol) || 'http:';
    var port = options.port || options.defaultPort || (agent && agent.defaultPort) || 80;
    var host = options.hostname || options.host || 'localhost';
    var path = options.path || '/';
    return discardUrlParameters(protocol + '//' + host + ':' + port + path);
  } catch (e) {
    return undefined;
  }
}
