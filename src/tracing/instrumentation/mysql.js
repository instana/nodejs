'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  requireHook.on('mysql', instrumentMysql);
  requireHook.on('mysql2', instrumentMysql2);
};


function instrumentMysql(mysql) {
  instrumentConnection(Object.getPrototypeOf(mysql.createConnection({})));
  instrumentPool(Object.getPrototypeOf(mysql.createPool({})));
}


function instrumentMysql2(mysql) {
  instrumentConnection(mysql.Connection.prototype);
  instrumentPool(Object.getPrototypeOf('mysql.Pool'));
}


function instrumentPool(Pool) {
  shimmer.wrap(Pool, 'query', shimQuery);
  shimmer.wrap(Pool, 'getConnection', shimGetConnection);
}


function instrumentConnection(Connection) {
  shimmer.wrap(Connection, 'query', shimQuery);
}


function shimQuery(original) {
  return function() {
    if (isActive && cls.isTracing()) {
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

  var parentSpan = cls.getCurrentSpan();
  if (cls.isExitSpan(parentSpan)) {
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

  var span = cls.startSpan('mysql');
  span.b = { s: 1 };
  span.stack = tracingUtil.getStackTrace(instrumentedQuery);
  span.data = {
      mysql: {
        stmt: tracingUtil.shortenDatabaseStatement(typeof statementOrOpts === 'string' ? statementOrOpts :
          statementOrOpts.sql),
        host: host,
        port: port,
        user: user,
        db: db
      }
    };

  var originalCallback = argsForOriginalQuery[argsForOriginalQuery.length - 1];
  argsForOriginalQuery[argsForOriginalQuery.length - 1] = function onQueryResult(error) {
    if (error) {
      span.ec = 1;
      span.error = true;
      span.data.mysql.error = tracingUtil.getErrorDetails(error);
    }

    span.d = Date.now() - span.ts;
    transmission.addSpan(span);

    if (originalCallback) {
      return originalCallback.apply(this, arguments);
    }
  };

  return originalQuery.apply(ctx, argsForOriginalQuery);
}


function shimGetConnection(original) {
  return function(cb) {
    return original.call(this, cls.ns.bind(cb));
  };
}

exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
