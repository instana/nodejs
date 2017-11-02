'use strict';

var coreHttpModule = require('http');

var discardUrlParameters = require('../../util/url').discardUrlParameters;
var tracingConstants = require('../constants');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var shimmer = require('shimmer');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  var proto = coreHttpModule.Server && coreHttpModule.Server.prototype;
  shimmer.wrap(proto, 'emit', shimEmit);
};

function shimEmit(realEmit) {
  return function() {
    var type = arguments[0];
    var req = arguments[1];
    var res = arguments[2];

    var originalThis = this;
    var originalArgs = arguments;

    if (type !== 'request' || !isActive) {
      return realEmit.apply(this, arguments);
    }

    var context = cls.createContext();

    if (req.headers[tracingConstants.traceLevelHeaderNameLowerCase] === '0') {
      cls.stanStorage.run(function() {
        context.tracingSuppressed = true;
        cls.setActiveContext(context);
        return realEmit.apply(originalThis, originalArgs);
      });
    }

    context.tracingSuppressed = false;

    var spanId = tracingUtil.generateRandomSpanId();
    var traceId = getExistingTraceId(req, spanId);
    var span = {
      s: spanId,
      t: traceId,
      p: getExistingSpanId(req),
      f: tracingUtil.getFrom(),
      async: false,
      error: false,
      ec: 0,
      ts: Date.now(),
      d: 0,
      n: 'node.http.server',
      stack: [],
      data: null
    };
    context.spanId = spanId;
    context.traceId = traceId;

    cls.stanStorage.bindEmitter(req);
    cls.stanStorage.bindEmitter(res);

    // Handle client / backend eum correlation.
    if (spanId === traceId) {
      req.headers['x-instana-t'] = traceId;
      res.setHeader('Server-Timing', 'ibs_' + traceId + '=1');
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
      cls.destroyContextByUid(context.uid);
    });

    cls.stanStorage.run(function() {
      cls.setActiveContext(context);
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
