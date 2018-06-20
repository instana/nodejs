'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  requireHook.on('pg', instrumentPg);
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

  var span = cls.startSpan('postgres');
  span.b = {s: 1};
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
    originalCallback = values;
  } else {
    originalCallback = callback;
  }

  callback = function(error) {
    if (error) {
      span.ec = 1;
      span.error = true;
      span.data.pg.error = tracingUtil.getErrorDetails(error);
    }

    span.d = Date.now() - span.ts;
    span.transmit();

    if (originalCallback) {
      return originalCallback.apply(this, arguments);
    }
  };
  return originalQuery.apply(ctx, [config, values, callback]);
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
