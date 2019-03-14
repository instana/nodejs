'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('mysql', instrumentMysql);
  requireHook.onModuleLoad('mysql2', instrumentMysql2);
  requireHook.onModuleLoad('mysql2/promise', instrumentMysql2WithPromises);
};

function instrumentMysql(mysql) {
  instrumentConnection(Object.getPrototypeOf(mysql.createConnection({})), false);
  instrumentPool(Object.getPrototypeOf(mysql.createPool({})));
}

function instrumentMysql2(mysql) {
  instrumentConnection(mysql.Connection.prototype, true);
  mysql.Pool && instrumentPool(mysql.Pool.prototype);
}

function instrumentMysql2WithPromises(mysql) {
  // Currently only pooled connections will be instrumented.
  instrumentPoolWithPromises(mysql);
}

function instrumentPool(Pool) {
  shimmer.wrap(Pool, 'query', shimQuery);
  // There is also an 'execute' method on the pool object but it uses the connection internally, so we do not need to
  // it. This is handled by the instrumented methods on Connection. We do need to instrument 'pool.query', though.
  shimmer.wrap(Pool, 'getConnection', shimGetConnection);
}

function instrumentConnection(Connection, mysql2) {
  shimmer.wrap(Connection, 'query', shimQuery);
  if (mysql2) {
    shimmer.wrap(Connection, 'execute', shimExecute);
  }
}

function instrumentPoolWithPromises(mysql) {
  shimmer.wrap(mysql, 'createPool', function(original) {
    return function() {
      var Pool = original.apply(this, arguments);
      var poolPrototype = Object.getPrototypeOf(Pool);
      shimmer.wrap(poolPrototype, 'getConnection', shimPromiseConnection);
      shimmer.wrap(poolPrototype, 'query', shimPromiseQuery);
      shimmer.wrap(poolPrototype, 'execute', shimPromiseExecute);
      return Pool;
    };
  });
}

function shimQuery(original) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}

function shimExecute(original) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}

function shimPromiseQuery(originalQuery) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, originalQuery, arguments[0], arguments[1], null, true);
    }
    return originalQuery.apply(this, arguments);
  };
}

function shimPromiseExecute(originalExecute) {
  return function() {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, originalExecute, arguments[0], arguments[1], null, true);
    }
    return originalExecute.apply(this, arguments);
  };
}

function instrumentedAccessFunction(
  ctx,
  originalFunction,
  statementOrOpts,
  valuesOrCallback,
  optCallback,
  isPromiseImpl
) {
  var originalArgs = [statementOrOpts, valuesOrCallback];
  if (typeof optCallback !== 'undefined') {
    originalArgs.push(optCallback);
  }

  var parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
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
    var span = cls.startSpan('mysql', constants.EXIT);
    span.b = { s: 1 };
    span.stack = tracingUtil.getStackTrace(instrumentedAccessFunction);
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
      var resultPromise = originalFunction.apply(ctx, originalArgs);

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
    var originalCallback = originalArgs[originalArgs.length - 1];
    var hasCallback = false;
    if (typeof originalCallback === 'function') {
      originalCallback = cls.ns.bind(originalCallback);
      hasCallback = true;
    }

    originalArgs[originalArgs.length - 1] = function onResult(error) {
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

    return originalFunction.apply(ctx, originalArgs);
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
      shimmer.wrap(connection, 'execute', shimPromiseExecute);

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
