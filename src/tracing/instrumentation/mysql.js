'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  requireHook.on('mysql', instrument);
};


function instrument(mysql) {
  var Connection = Object.getPrototypeOf(mysql.createConnection({}));
  var Pool = Object.getPrototypeOf(mysql.createPool({}));
  shimmer.wrap(Connection, 'query', shimQuery);
  shimmer.wrap(Pool, 'query', shimQuery);
  shimmer.wrap(Pool, 'getConnection', shimGetConnection);
}


function shimQuery(original) {
  return function() {
    if (isActive) {
      return instrumentedQuery(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}


function instrumentedQuery(ctx, originalQuery, statementOrOpts, valuesOrCallback, optCallback) {
  var argsForOriginalQuery = [statementOrOpts, valuesOrCallback];
  if (typeof optCallback !== 'undefined') {
    argsForOriginalQuery.push(optCallback);
  }

  cls.stanStorage.run(() => {
    var parentContext = cls.getActiveContext();
    var context = cls.createContext();

    if (context.tracingSuppressed || context.containsExitSpan) {
      return originalQuery.apply(ctx, argsForOriginalQuery);
    }

    var host;
    var port;
    var user;
    var db;
    if (ctx.config) {
      if (ctx.config.connectionConfig) {
        host = ctx.config.connectionConfig.host;
        port = ctx.config.connectionConfig.port;
        user = ctx.config.connectionConfig.user;
        db = ctx.config.connectionConfig.database;
      } else {
        host = ctx.config.host;
        port = ctx.config.port;
        user = ctx.config.user;
        db = ctx.config.database;
      }
    }

    context.markAsExitSpan = true;

    var spanId = tracingUtil.generateRandomSpanId();
    var traceId = context.traceId;
    var parentId = undefined;
    if (!traceId) {
      traceId = spanId;
    } else {
      parentId = context.parentSpanId;
    }

    var span = {
      s: spanId,
      t: traceId,
      p: parentId,
      f: tracingUtil.getFrom(),
      async: false,
      error: false,
      ec: 0,
      ts: Date.now(),
      d: 0,
      n: 'mysql',
      b: {
        s: 1
      },
      stack: tracingUtil.getStackTrace(instrumentedQuery),
      data: {
        mysql: {
          stmt: typeof statementOrOpts === 'string' ? statementOrOpts : statementOrOpts.sql,
          host: host,
          port: port,
          user: user,
          db: db
        }
      }
    };
    context.spanId = span.s;

    var originalCallback = argsForOriginalQuery[argsForOriginalQuery.length - 1];
    argsForOriginalQuery[argsForOriginalQuery.length - 1] = function onQueryResult(error) {
      if (error) {
        span.ec = 1;
        span.error = true;
        span.data.mysql.error = error.message;
      }

      span.d = Date.now() - span.ts;
      transmission.addSpan(span);
      cls.destroyContextByUid(context.uid);

      if (originalCallback) {
        return originalCallback.apply(this, arguments);
      }
    };

    return originalQuery.apply(ctx, argsForOriginalQuery);
  });
}


function shimGetConnection(original) {
  return function(cb) {
    var targetContextUid = cls.getActiveContext().uid;
    return original.call(this, wrappedCallback);

    function wrappedCallback() {
      if (cls.contextExistsByUid(targetContextUid)) {
        var originalContext = cls.getActiveContext();
        cls.setActiveContext(originContext);
        var result = cb.apply(this, arguments);
        cls.setActiveContext(originContext);
        return result;
      }

      return cb.apply(this, arguments);
    }
  }
}

exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
