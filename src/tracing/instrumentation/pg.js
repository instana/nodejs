'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('pg', instrumentPg);
};

function instrumentPg(pg) {
  instrumentClient(pg.Client);
}

function instrumentClient(Client) {
  shimmer.wrap(Client.prototype, 'query', shimQuery);
}

function shimQuery(original) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedQuery(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}

function instrumentedQuery(ctx, originalQuery, config, values, callback) {
  var parentSpan = cls.getCurrentSpan();

  if (cls.isExitSpan(parentSpan)) {
    return originalQuery.apply(ctx, [config, values, callback]);
  }

  var host = ctx.connectionParameters.host;
  var port = ctx.connectionParameters.port;
  var user = ctx.connectionParameters.user;
  var db = ctx.connectionParameters.database;

  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('postgres');
    span.stack = tracingUtil.getStackTrace(instrumentedQuery);
    span.data = {
      pg: {
        stmt: tracingUtil.shortenDatabaseStatement(typeof config === 'string' ? config : config.text),
        host: host,
        port: port,
        user: user,
        db: db
      }
    };

    var originalCallback;
    if (typeof(values) === 'function') {
      originalCallback = cls.ns.bind(values);
    } else {
      originalCallback = cls.ns.bind(callback);
    }

    var wrappedCallback = function(error, res) {
      if (error) {
        span.ec = 1;
        span.error = true;
        span.data.pg.error = tracingUtil.getErrorDetails(error);
      }

      span.d = Date.now() - span.ts;
      span.transmit();

      if (originalCallback) {
        cls.ns.bind(originalCallback).apply(this, [error, res]);
      }
    };

    if (typeof(values) === 'function') {
      values = cls.ns.bind(wrappedCallback);
    } else {
      callback = cls.ns.bind(wrappedCallback);
    }
    return originalQuery.apply(ctx, [config, values, callback]);
  });
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
