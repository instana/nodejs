'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

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

function instrumentedQuery(ctx, originalQuery, argsForOriginalQuery) {
  var parentSpan = cls.getCurrentSpan();

  if (constants.isExitSpan(parentSpan)) {
    return originalQuery.apply(ctx, argsForOriginalQuery);
  }

  var host = ctx.connectionParameters.host;
  var port = ctx.connectionParameters.port;
  var user = ctx.connectionParameters.user;
  var db = ctx.connectionParameters.database;

  var config = argsForOriginalQuery[0];

  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('postgres', constants.EXIT);
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
    var callbackIndex = -1;
    for (var i = 1; i < argsForOriginalQuery.length; i++) {
      if (typeof argsForOriginalQuery[i] === 'function') {
        originalCallback = argsForOriginalQuery[i];
        callbackIndex = i;
        break;
      }
    }

    if (callbackIndex >= 0) {
      var wrappedCallback = function(error) {
        finishSpan(error, span);
        return originalCallback.apply(this, arguments);
      };
      argsForOriginalQuery[callbackIndex] = cls.ns.bind(wrappedCallback);
    }

    var promise = originalQuery.apply(ctx, argsForOriginalQuery);
    if (promise && typeof promise.then === 'function') {
      promise
        .then(function(value) {
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

function finishSpan(error, span) {
  if (error) {
    span.ec = 1;
    span.error = true;
    span.data.pg.error = tracingUtil.getErrorDetails(error);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
