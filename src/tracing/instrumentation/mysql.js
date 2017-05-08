'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var hook = require('../hook');

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

  var uid = hook.initAndPreSimulated();
  var tracingSuppressed = hook.isTracingSuppressed(uid);
  if (tracingSuppressed || hook.containsExitSpan(uid)) {
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

  hook.markAsExitSpan(uid);

  var spanId = tracingUtil.generateRandomSpanId();
  var traceId = hook.getTraceId(uid);
  var parentId = undefined;
  if (!traceId) {
    traceId = spanId;
  } else {
    parentId = hook.getParentSpanId(uid);
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
  hook.setSpanId(uid, span.s);

  var originalCallback = argsForOriginalQuery[argsForOriginalQuery.length - 1];
  argsForOriginalQuery[argsForOriginalQuery.length - 1] = function onQueryResult(error) {
    if (error) {
      span.ec = 1;
      span.error = true;
      span.data.mysql.error = error.message;
    }

    span.d = Date.now() - span.ts;
    transmission.addSpan(span);
    hook.postAndDestroySimulated(uid);

    if (originalCallback) {
      return originalCallback.apply(this, arguments);
    }
  };

  return originalQuery.apply(ctx, argsForOriginalQuery);
}

function shimGetConnection(original) {
  return function(cb) {
    var targetContextUid = hook.getCurrentUid();
    return original.call(this, wrappedCallback);

    function wrappedCallback() {
      if (hook.isUidExisting(targetContextUid)) {
        var originalContextUid = hook.getCurrentUid();
        hook.preAsync(targetContextUid);
        hook.initAndPreSimulated();
        var result = cb.apply(this, arguments);
        hook.preAsync(originalContextUid);
        return result;
      }

      return cb.apply(this, arguments);
    }
  };
}

exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
