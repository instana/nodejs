'use strict';

var coreHttpsModule = require('https');
var coreHttpModule = require('http');

var discardUrlParameters = require('../../util/url').discardUrlParameters;
var tracingConstants = require('../constants');
var transmission = require('../transmission');
var shimmer = require('shimmer');
var cls = require('../cls');

var isActive = false;

exports.spanName = 'node.http.server';

exports.init = function() {
  shimmer.wrap(coreHttpModule.Server && coreHttpModule.Server.prototype, 'emit', shimEmit);
  shimmer.wrap(coreHttpsModule.Server && coreHttpsModule.Server.prototype, 'emit', shimEmit);
};

function shimEmit(realEmit) {
  return function(type, req, res) {
    var originalThis = this;
    var originalArgs = arguments;

    return cls.ns.runAndReturn(function() {
      // Respect any incoming tracing level headers
      if (req && req.headers && req.headers[tracingConstants.traceLevelHeaderNameLowerCase] === '0') {
        cls.setTracingLevel(req.headers[tracingConstants.traceLevelHeaderNameLowerCase]);
      }

      if (type !== 'request' || !isActive || cls.tracingSuppressed()) {
        return realEmit.apply(originalThis, originalArgs);
      }

      var incomingTraceId = getExistingTraceId(req);
      var incomingSpanId = getExistingSpanId(req);
      // expose the span for the express instrumentation
      var span = req.__instanaHttpSpan = cls.startSpan(exports.spanName, incomingTraceId, incomingSpanId);

      // Grab the URL before application code gets access to the incoming message.
      // We are doing this because libs like express are manipulating req.url when
      // using routers.
      var urlParts = req.url.split('?');
      span.data = {
        http: {
          method: req.method,
          url: discardUrlParameters(urlParts.shift()),
          params: urlParts.join('?'),
          host: req.headers.host
        }
      };

      // Handle client / backend eum correlation.
      if (!span.p) {
        req.headers['x-instana-t'] = span.t;

        // support for automatic client / backend eum correlation
        // intid = instana trace id
        // This abbreviation is small enough to not incur a notable overhead while at the same
        // time being unique (funky) enough to avoid name collisions.
        var serverTimingValue = 'intid;desc=' + span.t;
        res.setHeader('Server-Timing', serverTimingValue);
        shimmer.wrap(res, 'setHeader', function(realSetHeader) {
          return function shimmedSetHeader(key, value) {
            if (key.toLowerCase() === 'server-timing') {
              if (value instanceof Array) {
                return realSetHeader.call(this, key, value.concat(serverTimingValue));
              }
              return realSetHeader.call(this, key, value + ', ' + serverTimingValue);
            }
            return realSetHeader.apply(this, arguments);
          };
        });
      }

      res.on('finish', function() {
        span.data.http.status = res.statusCode;
        span.error = res.statusCode >= 500;
        span.ec = span.error ? 1 : 0;
        span.d = Date.now() - span.ts;
        transmission.addSpan(span);
      });

      cls.ns.bindEmitter(req);
      cls.ns.bindEmitter(res);

      var ret = null;
      ret = realEmit.apply(originalThis, originalArgs);
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
