'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;


exports.init = function() {
  requireHook.onModuleLoad('mssql', instrumentMssql);
};


function instrumentMssql(mssql) {
  instrumentRequest(mssql.Request);
  instrumentPreparedStatement(mssql.PreparedStatement);
  instrumentTransaction(mssql.Transaction);

  // RequestError: [Function: RequestError],
  //
  // connect: [Function: connect],
  // close: [Function: close],
  // on: [Function: on],
  // off: [Function: removeListener],
  // removeListener: [Function: removeListener],
  // query: [Function: query],
  // batch: [Function: batch],
}


function instrumentRequest(Request) {
  shimmer.wrap(Request.prototype, 'query', shimQuery);
}


function shimQuery(originalFunction) {
  return function() {
    if (isActive && cls.isTracing()) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedQuery(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}


function instrumentedQuery(ctx, originalFunction, originalArgs) {
  var parentSpan = cls.getCurrentSpan();

  if (cls.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  var connectionParameters = findConnectionParameters(ctx);
  var command = originalArgs[0];
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('mssql');
    span.stack = tracingUtil.getStackTrace(instrumentedQuery);
    span.data = {
      mssql: {
        stmt: tracingUtil.shortenDatabaseStatement(command),
        host: connectionParameters.host,
        port: connectionParameters.port,
        user: connectionParameters.user,
        db: connectionParameters.db
      }
    };

    var originalCallback;
    if (originalArgs.length >= 2 && typeof originalArgs[1] === 'function') {
      originalCallback = cls.ns.bind(originalArgs[1]);
    }

    if (originalCallback) {
      // original call had a callback argument, replace it with our wrapper
      var wrappedCallback = function(error) {
        finishSpan(error, span);
        return cls.ns.bind(originalCallback).apply(this, arguments);
      };
      originalArgs[1] = cls.ns.bind(wrappedCallback);
    }

    var promise = originalFunction.apply(ctx, originalArgs);
    if (typeof promise.then === 'function') {
      promise.then(function(value) {
        finishSpan(null, span);
        return value;
      })
      .catch(function(error) {
        finishSpan(error, span);
        return error;
      });
    }
    return promise;
  });
}


function instrumentPreparedStatement(PreparedStatement) {
  shimmer.wrap(PreparedStatement.prototype, 'prepare', shimPrepare);
  shimmer.wrap(PreparedStatement.prototype, 'execute', shimExecute);
}


function shimPrepare(originalFunction) {
  return function() {
    if (isActive && cls.isTracing()) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      if (originalArgs.length >= 2 && typeof originalArgs[1] === 'function') {
        originalArgs[1] = cls.ns.bind(originalArgs[1]);
      }
      cls.ns.set('com.instana.mssql.stmt', originalArgs[0]);
      return originalFunction.apply(this, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}


function shimExecute(originalFunction) {
  return function() {
    if (isActive && cls.isTracing()) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedExecute(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}


function instrumentedExecute(ctx, originalFunction, originalArgs) {
  var parentSpan = cls.getCurrentSpan();

  if (cls.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  var connectionParameters = findConnectionParameters(ctx);
  var command = cls.ns.get('com.instana.mssql.stmt');
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('mssql');
    span.stack = tracingUtil.getStackTrace(instrumentedExecute);
    span.data = {
      mssql: {
        stmt: tracingUtil.shortenDatabaseStatement(command),
        host: connectionParameters.host,
        port: connectionParameters.port,
        user: connectionParameters.user,
        db: connectionParameters.db
      }
    };

    var originalCallback;
    if (originalArgs.length >= 2 && typeof originalArgs[1] === 'function') {
      originalCallback = cls.ns.bind(originalArgs[1]);
    }

    if (originalCallback) {
      // original call had a callback argument, replace it with our wrapper
      var wrappedCallback = function(error) {
        finishSpan(error, span);
        return cls.ns.bind(originalCallback).apply(this, arguments);
      };
      originalArgs[1] = cls.ns.bind(wrappedCallback);
    }

    var promise = originalFunction.apply(ctx, originalArgs);
    if (typeof promise.then === 'function') {
      promise.then(function(value) {
        finishSpan(null, span);
        return value;
      })
      .catch(function(error) {
        finishSpan(error, span);
        return error;
      });
    }
    return promise;
  });
}


function instrumentTransaction(Transaction) {
  shimmer.wrap(Transaction.prototype, 'begin', shimBeginTransaction);
}


function shimBeginTransaction(originalFunction) {
  return function() {
    if (isActive && cls.isTracing()) {
      var originalArgs = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      if (typeof originalArgs[1] === 'function') {
        originalArgs[1] = cls.ns.bind(originalArgs[1]);
      } else if (typeof originalArgs[0] === 'function') {
        originalArgs[0] = cls.ns.bind(originalArgs[0]);
      }
      return originalFunction.apply(this, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}


function finishSpan(error, span) {
  if (error) {
    span.ec = 1;
    span.error = true;
    span.data.mssql.error = tracingUtil.getErrorDetails(error);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}


function findConnectionParameters(ctx) {
  if (ctx.parent && ctx.parent.config && ctx.parent.config.server) {
    return {
      host: ctx.parent.config.server,
      port: ctx.parent.config.port,
      user: ctx.parent.config.user,
      db: ctx.parent.config.database
    };
  } else if (ctx.parent) {
    // search the tree of Request, Transaction, ... upwards recursively for a connection config
    return findConnectionParameters(ctx.parent);
  } else {
    // Fallback if we can't find the connection parameters.
    return {
      host: '',
      port: -1,
      user: '',
      db: '',
    };
  }
}


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
