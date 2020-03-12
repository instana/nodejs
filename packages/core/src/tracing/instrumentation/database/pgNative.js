'use strict';

var LRU = require('lru-cache');
var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var constants = require('../../constants');
var cls = require('../../cls');

var isActive = false;

var preparedStatements = new LRU(100000);

// See https://www.postgresql.org/docs/9.3/libpq-connect.html#AEN39692
// Pattern: postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
// eslint-disable-next-line max-len
var connectionUriRegex = /^\s*postgres(?:ql)?:\/\/(?:([^:@]+)?(?::.+)?@)?([^:/?#]+)?(?::(\d+))?(?:\/([^?]+))?(?:\?.*)?$/;
//                            ^protocol  user+pass^  ^user    ^pass      ^netloc     ^port      ^db           ^params

exports.init = function() {
  requireHook.onModuleLoad('pg-native', instrumentPgNative);
};

function instrumentPgNative(Client) {
  shimmer.wrap(Client.prototype, '_awaitResult', shimAwaitResult);
  shimmer.wrap(Client.prototype, 'connect', shimConnect);
  shimmer.wrap(Client.prototype, 'connectSync', shimConnect);
  shimmer.wrap(Client.prototype, 'query', shimQueryOrExecute.bind(null, instrumentedQuery));
  shimmer.wrap(Client.prototype, 'querySync', shimQueryOrExecuteSync.bind(null, false));
  shimmer.wrap(Client.prototype, 'prepare', shimPrepare);
  shimmer.wrap(Client.prototype, 'prepareSync', shimPrepare);
  shimmer.wrap(Client.prototype, 'execute', shimQueryOrExecute.bind(null, instrumentedExecute));
  shimmer.wrap(Client.prototype, 'executeSync', shimQueryOrExecuteSync.bind(null, true));
}

function shimConnect(original) {
  return function(connectionString) {
    var connectionParams = exports.parseConnectionParameters(connectionString);
    if (Object.keys(connectionParams).length > 0) {
      this._instana = connectionParams;
    }
    return original.apply(this, arguments);
  };
}

function shimAwaitResult(original) {
  return function() {
    if (!isActive || !cls.isTracing() || typeof arguments[0] !== 'function') {
      return original.apply(this, arguments);
    }
    var originalArgs = new Array(arguments.length);
    originalArgs[0] = cls.ns.bind(arguments[0]);
    for (var i = 1; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return original.apply(this, originalArgs);
  };
}

function shimPrepare(original) {
  return function(statementName, text) {
    preparedStatements.set(statementName, text);
    return original.apply(this, arguments);
  };
}

function shimQueryOrExecute(instrumented, original) {
  return function() {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return instrumented(this, original, originalArgs);
  };
}

function instrumentedQuery(ctx, originalQuery, originalArgs) {
  var parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalQuery.apply(ctx, originalArgs);
  }
  var statement = originalArgs[0];
  var stackTraceRef = instrumentedQuery;
  return startSpan(ctx, originalQuery, originalArgs, statement, stackTraceRef);
}

function instrumentedExecute(ctx, originalExecute, originalArgs) {
  var parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalExecute.apply(ctx, originalArgs);
  }
  var statement = preparedStatements.get(originalArgs[0]);
  var stackTraceRef = instrumentedExecute;
  return startSpan(ctx, originalExecute, originalArgs, statement, stackTraceRef);
}

function shimQueryOrExecuteSync(isExecute, original) {
  return function() {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    var statement = isExecute ? preparedStatements.get(originalArgs[0]) : originalArgs[0];
    var resultAndSpan = startSpanBeforeSync(this, original, originalArgs, statement, shimQueryOrExecuteSync);
    finishSpan(resultAndSpan.error, resultAndSpan.span);
    if (resultAndSpan.error) {
      throw resultAndSpan.error;
    }
    return resultAndSpan.result;
  };
}

function startSpan(ctx, originalFn, originalArgs, statement, stackTraceRef) {
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('postgres', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(stackTraceRef);
    span.data.pg = {
      stmt: tracingUtil.shortenDatabaseStatement(statement),
      host: ctx._instana ? ctx._instana.host : undefined,
      port: ctx._instana ? ctx._instana.port : undefined,
      user: ctx._instana ? ctx._instana.user : undefined,
      db: ctx._instana ? ctx._instana.db : undefined
    };

    var originalCallback;
    var callbackIndex = -1;
    for (var i = 1; i < originalArgs.length; i++) {
      if (typeof originalArgs[i] === 'function') {
        originalCallback = originalArgs[i];
        callbackIndex = i;
        break;
      }
    }

    if (callbackIndex >= 0) {
      var wrappedCallback = function(error) {
        finishSpan(error, span);
        return originalCallback.apply(this, arguments);
      };
      originalArgs[callbackIndex] = cls.ns.bind(wrappedCallback);
    }

    return originalFn.apply(ctx, originalArgs);
  });
}

function startSpanBeforeSync(ctx, originalFn, originalArgs, statement, stackTraceRef) {
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('postgres', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(stackTraceRef);
    span.data.pg = {
      stmt: tracingUtil.shortenDatabaseStatement(statement),
      host: ctx._instana ? ctx._instana.host : undefined,
      port: ctx._instana ? ctx._instana.port : undefined,
      user: ctx._instana ? ctx._instana.user : undefined,
      db: ctx._instana ? ctx._instana.db : undefined
    };

    var result;
    var error;
    try {
      result = originalFn.apply(ctx, originalArgs);
    } catch (_error) {
      error = _error;
    }

    return {
      result: result,
      error: error,
      span: span
    };
  });
}

function finishSpan(error, span) {
  if (error) {
    span.ec = 1;
    span.data.pg.error = tracingUtil.getErrorDetails(error);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

// exported for testability
exports.parseConnectionParameters = function parseConnectionParameters(connectionString) {
  var connectionParams = {};
  if (typeof connectionString === 'string') {
    connectionString = connectionString.trim();
    if (connectionString.indexOf('postgres') === 0) {
      parseConnectionUri(connectionString, connectionParams);
    } else {
      parseKeyValueConnectionString(connectionString, connectionParams);
    }
  } else {
    parseConnectionEnvVars(connectionParams);
  }

  if (connectionParams.hostaddr && !connectionParams.host) {
    connectionParams.host = connectionParams.hostaddr;
  }
  delete connectionParams.hostaddr;
  if (connectionParams.dbname) {
    connectionParams.db = connectionParams.dbname;
    delete connectionParams.dbname;
  }
  return connectionParams;
};

function parseConnectionUri(connectionString, connectionParams) {
  // See https://www.postgresql.org/docs/9.3/libpq-connect.html#AEN39692
  var matchResult = connectionUriRegex.exec(connectionString);
  if (matchResult) {
    readConnectionParamFromRegexMatch(connectionParams, matchResult, 1, 'user');
    readConnectionParamFromRegexMatch(connectionParams, matchResult, 2, 'host');
    readConnectionParamFromRegexMatch(connectionParams, matchResult, 3, 'port');
    readConnectionParamFromRegexMatch(connectionParams, matchResult, 4, 'db');
  }
}

function readConnectionParamFromRegexMatch(connectionParams, matchResult, index, key) {
  if (matchResult[index] != null) {
    connectionParams[key] = matchResult[index];
  }
}

function parseKeyValueConnectionString(connectionString, connectionParams) {
  // eslint-disable-next-line max-len
  // See https://www.postgresql.org/docs/9.3/libpq-connect.html#LIBPQ-CONNSTRING and https://www.postgresql.org/docs/9.3/libpq-connect.html#LIBPQ-PARAMKEYWORDS
  connectionString
    .split(' ')
    .map(function(pair) {
      return pair.trim();
    })
    .forEach(function(pair) {
      return ['host', 'hostaddr', 'port', 'dbname', 'user'].forEach(function(key) {
        return parseConnectStringKeyValuePair(connectionParams, pair, key);
      });
    });
}

function parseConnectStringKeyValuePair(connectionParams, pair, key) {
  if (pair.toLowerCase().indexOf(key + '=') === 0) {
    connectionParams[key] = pair.split('=')[1];
  }
}

function parseConnectionEnvVars(connectionParams) {
  // see https://www.postgresql.org/docs/9.3/libpq-envars.html
  parseEnvVar(connectionParams, 'PGHOST', 'host');
  parseEnvVar(connectionParams, 'PGHOSTADDR', 'hostaddr');
  parseEnvVar(connectionParams, 'PGPORT', 'port');
  parseEnvVar(connectionParams, 'PGDATABASE', 'db');
  parseEnvVar(connectionParams, 'PGUSER', 'user');
}

function parseEnvVar(connectionParams, keyEnvVar, keyConnectionParams) {
  if (process.env[keyEnvVar]) {
    connectionParams[keyConnectionParams] = process.env[keyEnvVar];
  }
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
