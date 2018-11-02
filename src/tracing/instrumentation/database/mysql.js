'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('mysql', instrumentMysql);
  requireHook.onModuleLoad('mysql2', instrumentMysql2);
  requireHook.onModuleLoad('mysql2/promise', instrumentMysql2WithPromises);
};

function instrumentMysql(mysql) {
  instrumentConnection(Object.getPrototypeOf(mysql.createConnection({})));
  instrumentPool(Object.getPrototypeOf(mysql.createPool({})));
}

function instrumentMysql2(mysql) {
  instrumentConnection(mysql.Connection.prototype);
  mysql.Pool && instrumentPool(mysql.Pool.prototype);
}

function instrumentMysql2WithPromises(mysql) {
  // Currently only pooled connection will be instrumented
  instrumentPoolWithPromises(mysql);
}

function instrumentPool(Pool) {
  shimmer.wrap(Pool, 'query', shimQuery);
  shimmer.wrap(Pool, 'getConnection', shimGetConnection);
}

function instrumentConnection(Connection) {
  shimmer.wrap(Connection, 'query', shimQuery);
}

function instrumentPoolWithPromises(mysql) {
  shimmer.wrap(mysql, 'createPool', function(original) {
    return function() {
      var Pool = original.apply(this, arguments);
      shimmer.wrap(Object.getPrototypeOf(Pool), 'getConnection', shimPromiseConnection);
      return Pool;
    };
  });
}

function shimQuery(original) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedQuery(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}

function shimPromiseQuery(originalQuery) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedQuery(this, originalQuery, arguments[0], arguments[1], null, true);
    }
    return originalQuery.apply(this, arguments);
  };
}

function instrumentedQuery(ctx, originalQuery, statementOrOpts, valuesOrCallback, optCallback, isPromiseImpl) {
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

  // if ctx.connection is defined, we are in a PromiseConnection context
  var config = ctx.connection != null ? ctx.connection.config : ctx.config;
  if (config) {
    if (config.connectionConfig) {
      host = config.connectionConfig.host;
      port = config.connectionConfig.port;
      user = config.connectionConfig.user;
      db = config.connectionConfig.database;
    } else {
      host = config.host;
      port = config.port;
      user = config.user;
      db = config.database;
    }
  }

  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('mysql', cls.EXIT);
    span.b = { s: 1 };
    span.stack = tracingUtil.getStackTrace(instrumentedQuery);
    span.data = {
      mysql: {
        stmt: tracingUtil.shortenDatabaseStatement(
          typeof statementOrOpts === 'string' ? statementOrOpts : statementOrOpts.sql
        ),
        host: host,
        port: port,
        user: user,
        db: db
      }
    };

    if (isPromiseImpl) {
      var resultPromise = originalQuery.apply(ctx, argsForOriginalQuery);

      resultPromise
        .then(function(result) {
          span.d = Date.now() - span.ts;
          span.transmit();
          return result;
        })
        .catch(function(error) {
          span.ec = 1;
          span.error = true;
          span.data.mysql.error = tracingUtil.getErrorDetails(error);

          span.d = Date.now() - span.ts;
          span.transmit();
          return error;
        });
      return resultPromise;
    }

    // no promise, continue with standard instrumentation
    var originalCallback = argsForOriginalQuery[argsForOriginalQuery.length - 1];
    var hasCallback = false;
    if (typeof originalCallback === 'function') {
      originalCallback = cls.ns.bind(originalCallback);
      hasCallback = true;
    }

    argsForOriginalQuery[argsForOriginalQuery.length - 1] = function onQueryResult(error) {
      if (error) {
        span.ec = 1;
        span.error = true;
        span.data.mysql.error = tracingUtil.getErrorDetails(error);
      }

      span.d = Date.now() - span.ts;
      span.transmit();

      if (hasCallback) {
        return originalCallback.apply(this, arguments);
      }
    };

    return originalQuery.apply(ctx, argsForOriginalQuery);
  });
}

function shimGetConnection(original) {
  return function(cb) {
    return original.call(this, cls.ns.bind(cb));
  };
}

function shimPromiseConnection(original) {
  return function getConnection() {
    return original.apply(this, arguments).then(function(connection) {
      shimmer.wrap(connection, 'query', shimPromiseQuery);

      return connection;
    });
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
