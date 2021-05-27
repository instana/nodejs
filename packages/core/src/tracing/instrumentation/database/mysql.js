/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.spanName = 'mysql';
exports.batchable = true;

exports.init = function init() {
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
  // instrument it. This is handled by the instrumented methods on Connection. We do need to instrument 'pool.query',
  // though.
  shimmer.wrap(Pool, 'getConnection', shimGetConnection);
}

function instrumentConnection(Connection, mysql2) {
  shimmer.wrap(Connection, 'query', shimQuery);
  if (mysql2) {
    shimmer.wrap(Connection, 'execute', shimExecute);
  }
}

function instrumentPoolWithPromises(mysql) {
  shimmer.wrap(
    mysql,
    'createPool',
    original =>
      function () {
        const Pool = original.apply(this, arguments);
        const poolPrototype = Object.getPrototypeOf(Pool);
        shimmer.wrap(poolPrototype, 'getConnection', shimPromiseConnection);
        shimmer.wrap(poolPrototype, 'query', shimPromiseQuery);
        shimmer.wrap(poolPrototype, 'execute', shimPromiseExecute);
        return Pool;
      }
  );
}

function shimQuery(original) {
  return function () {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}

function shimExecute(original) {
  return function () {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, original, arguments[0], arguments[1], arguments[2]);
    }
    return original.apply(this, arguments);
  };
}

function shimPromiseQuery(originalQuery) {
  return function () {
    if (isActive && cls.isTracing()) {
      return instrumentedAccessFunction(this, originalQuery, arguments[0], arguments[1], null, true);
    }
    return originalQuery.apply(this, arguments);
  };
}

function shimPromiseExecute(originalExecute) {
  return function () {
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
  const originalArgs = [statementOrOpts, valuesOrCallback];
  if (typeof optCallback !== 'undefined') {
    originalArgs.push(optCallback);
  }

  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  let host;
  let port;
  let user;
  let db;

  // if ctx.connection is defined, we are in a PromiseConnection context
  const config = ctx.connection != null ? ctx.connection.config : ctx.config;
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

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.b = { s: 1 };
    span.stack = tracingUtil.getStackTrace(instrumentedAccessFunction);
    span.data.mysql = {
      stmt: tracingUtil.shortenDatabaseStatement(
        typeof statementOrOpts === 'string' ? statementOrOpts : statementOrOpts.sql
      ),
      host,
      port,
      user,
      db
    };

    if (isPromiseImpl) {
      const resultPromise = originalFunction.apply(ctx, originalArgs);

      resultPromise
        .then(result => {
          span.d = Date.now() - span.ts;
          span.transmit();
          return result;
        })
        .catch(error => {
          span.ec = 1;
          span.data.mysql.error = tracingUtil.getErrorDetails(error);

          span.d = Date.now() - span.ts;
          span.transmit();
          return error;
        });
      return resultPromise;
    }

    // no promise, continue with standard instrumentation
    let originalCallback;

    function onResult(error) {
      if (error) {
        span.ec = 1;
        span.data.mysql.error = tracingUtil.getErrorDetails(error);
      }

      span.d = Date.now() - span.ts;
      span.transmit();

      if (originalCallback) {
        return originalCallback.apply(this, arguments);
      }
    }

    if (typeof statementOrOpts._callback === 'function') {
      originalCallback = cls.ns.bind(statementOrOpts._callback);
      statementOrOpts._callback = onResult;
    } else {
      if (typeof originalArgs[originalArgs.length - 1] === 'function') {
        originalCallback = cls.ns.bind(originalArgs[originalArgs.length - 1]);
      }
      originalArgs[originalArgs.length - 1] = onResult;
    }

    return originalFunction.apply(ctx, originalArgs);
  });
}

function shimGetConnection(original) {
  return function getConnection(cb) {
    return original.call(this, cls.ns.bind(cb));
  };
}

function shimPromiseConnection(original) {
  return function getConnection() {
    return original.apply(this, arguments).then(connection => {
      shimmer.wrap(connection, 'query', shimPromiseQuery);
      shimmer.wrap(connection, 'execute', shimPromiseExecute);

      return connection;
    });
  };
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
