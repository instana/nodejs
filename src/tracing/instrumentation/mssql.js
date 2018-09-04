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
  // ConnectionPool: [Function: ConnectionPool],
  // Transaction: [Function: Transaction],
  // Request: [Function: Request],
  // PreparedStatement: [Function: PreparedStatement],
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


function shimQuery(original) {
  return function() {
    if (isActive && cls.isTracing()) {
      // slightly more performant version of the usual Array.prototype.slice trick.
      var argsForOriginalQuery = new Array(arguments.length);
      for (var i = 0; i < arguments.length; i++) {
        argsForOriginalQuery[i] = arguments[i];
      }
      return instrumentedQuery(this, original, argsForOriginalQuery);
    }
    return original.apply(this, arguments);
  };
}


function instrumentedQuery(ctx, originalQueryFunction, argsForOriginalQuery) {
  var parentSpan = cls.getCurrentSpan();

  if (cls.isExitSpan(parentSpan)) {
    return originalQueryFunction.apply(ctx, argsForOriginalQuery);
  }

  var connectionParameters = findConnectionParameters(ctx);
  var command = argsForOriginalQuery[0];
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
    if (argsForOriginalQuery.length >= 1 && typeof argsForOriginalQuery[1] === 'function') {
      originalCallback = cls.ns.bind(argsForOriginalQuery[1]);
    }

    var wrappedCallback = function(error) {
      if (error) {
        span.ec = 1;
        span.error = true;
        span.data.pg.error = tracingUtil.getErrorDetails(error);
      }

      span.d = Date.now() - span.ts;
      span.transmit();

      if (originalCallback) {
        return cls.ns.bind(originalCallback).apply(this, arguments);
      }
    };

    if (originalCallback) {
      argsForOriginalQuery[1] = cls.ns.bind(wrappedCallback);
    }
    return originalQueryFunction.apply(ctx, argsForOriginalQuery);
  });
}


function findConnectionParameters(ctx) {
  if (ctx.parent &&
      ctx.parent.config) {
    return {
      host: ctx.parent.config.server,
      port: ctx.parent.config.port,
      user: ctx.parent.config.user,
      db: ctx.parent.config.database
    };
  }

  // Fallback if we can't find the connection parameters.
  return {
    host: '',
    port: -1,
    user: '',
    db: '',
  };
}


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
