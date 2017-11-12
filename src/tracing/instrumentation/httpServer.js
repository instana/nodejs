'use strict';

var coreHttpModule = require('http');

var discardUrlParameters = require('../../util/url').discardUrlParameters;
var tracingConstants = require('../constants');
var transmission = require('../transmission');
var shimmer = require('shimmer');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  var proto = coreHttpModule.Server && coreHttpModule.Server.prototype;
  shimmer.wrap(proto, 'emit', shimEmit);
};

function shimEmit(realEmit) {
  return function(type, req, res) {
    return cls.ns.runAndReturn(() => {
      // Respect any incoming tracing level headers
      if (req && req.headers && req.headers[tracingConstants.traceLevelHeaderNameLowerCase] === '0') {
        cls.setTracingLevel(req.headers[tracingConstants.traceLevelHeaderNameLowerCase]);
      }

      if (type !== 'request' || !isActive || cls.tracingSuppressed()) {
        return realEmit.apply(this, arguments);
      }

      var incomingTraceId = getExistingTraceId(req);
      var incomingSpanId = getExistingSpanId(req);
      var span = cls.startSpan('node.http.server', incomingTraceId, incomingSpanId);

      // Handle client / backend eum correlation.
      if (span.s === span.t) {
        req.headers['x-instana-t'] = span.t;
        res.setHeader('Server-Timing', 'ibs_' + span.t + '=1');
      }

      res.on('finish', function() {
        var urlParts = req.url.split('?');
        span.data = {
          http: {
            method: req.method,
            url: discardUrlParameters(urlParts.shift()),
            params: urlParts.join('?'),
            status: res.statusCode,
            host: req.headers.host
          }
        };
        span.error = res.statusCode >= 500;
        span.ec = span.error ? 1 : 0;
        span.d = Date.now() - span.ts;
        transmission.addSpan(span);
      });

      cls.ns.bindEmitter(req);
      cls.ns.bindEmitter(res);

      var origThis = this;
      var origArgs = arguments;
      var ret = null;

      cls.ns.run(function() {
        ret = realEmit.apply(origThis, origArgs);
      });
      return ret;
    });
  };
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
  if (spanId === null) {
    return fallback;
  }

  return spanId;
}


function getExistingTraceId(req, fallback) {
  fallback = arguments.length > 1 ? fallback : null;

  var traceId = req.headers[tracingConstants.traceIdHeaderNameLowerCase];
  if (traceId === null) {
    return fallback;
  }

  return traceId;
}
