/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const LRU = require('lru-cache');
const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

const preparedStatements = new LRU(100000);

// See https://www.postgresql.org/docs/9.3/libpq-connect.html#AEN39692
// Pattern: postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
// eslint-disable-next-line max-len
const connectionUriRegex =
  /^\s*postgres(?:ql)?:\/\/(?:([^:@]+)?(?::.+)?@)?([^:/?#]+)?(?::(\d+))?(?:\/([^?]+))?(?:\?.*)?$/;
//                            ^protocol  user+pass^  ^user    ^pass      ^netloc     ^port      ^db           ^params

exports.spanName = 'postgres';
exports.batchable = true;

exports.init = function init() {
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
  return function (connectionString) {
    const connectionParams = exports.parseConnectionParameters(connectionString);
    if (Object.keys(connectionParams).length > 0) {
      this._instana = connectionParams;
    }
    return original.apply(this, arguments);
  };
}

function shimAwaitResult(original) {
  return function () {
    if (!isActive || !cls.isTracing() || typeof arguments[0] !== 'function') {
      return original.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    originalArgs[0] = cls.ns.bind(arguments[0]);
    for (let i = 1; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return original.apply(this, originalArgs);
  };
}

function shimPrepare(original) {
  return function (statementName, text) {
    preparedStatements.set(statementName, text);
    return original.apply(this, arguments);
  };
}

function shimQueryOrExecute(instrumented, original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return instrumented(this, original, originalArgs);
  };
}

function instrumentedQuery(ctx, originalQuery, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalQuery.apply(ctx, originalArgs);
  }
  const statement = originalArgs[0];
  const stackTraceRef = instrumentedQuery;
  return startSpan(ctx, originalQuery, originalArgs, statement, stackTraceRef);
}

function instrumentedExecute(ctx, originalExecute, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return originalExecute.apply(ctx, originalArgs);
  }
  const statement = preparedStatements.get(originalArgs[0]);
  const stackTraceRef = instrumentedExecute;
  return startSpan(ctx, originalExecute, originalArgs, statement, stackTraceRef);
}

function shimQueryOrExecuteSync(isExecute, original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    const statement = isExecute ? preparedStatements.get(originalArgs[0]) : originalArgs[0];
    const resultAndSpan = startSpanBeforeSync(this, original, originalArgs, statement, shimQueryOrExecuteSync);
    finishSpan(resultAndSpan.error, resultAndSpan.span);
    if (resultAndSpan.error) {
      throw resultAndSpan.error;
    }
    return resultAndSpan.result;
  };
}

function startSpan(ctx, originalFn, originalArgs, statement, stackTraceRef) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(stackTraceRef);
    span.data.pg = {
      stmt: tracingUtil.shortenDatabaseStatement(statement),
      host: ctx._instana ? ctx._instana.host : undefined,
      port: ctx._instana ? ctx._instana.port : undefined,
      user: ctx._instana ? ctx._instana.user : undefined,
      db: ctx._instana ? ctx._instana.db : undefined
    };

    let originalCallback;
    let callbackIndex = -1;
    for (let i = 1; i < originalArgs.length; i++) {
      if (typeof originalArgs[i] === 'function') {
        originalCallback = originalArgs[i];
        callbackIndex = i;
        break;
      }
    }

    if (callbackIndex >= 0) {
      const wrappedCallback = function (error) {
        finishSpan(error, span);
        return originalCallback.apply(this, arguments);
      };
      originalArgs[callbackIndex] = cls.ns.bind(wrappedCallback);
    }

    return originalFn.apply(ctx, originalArgs);
  });
}

function startSpanBeforeSync(ctx, originalFn, originalArgs, statement, stackTraceRef) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(stackTraceRef);
    span.data.pg = {
      stmt: tracingUtil.shortenDatabaseStatement(statement),
      host: ctx._instana ? ctx._instana.host : undefined,
      port: ctx._instana ? ctx._instana.port : undefined,
      user: ctx._instana ? ctx._instana.user : undefined,
      db: ctx._instana ? ctx._instana.db : undefined
    };

    let result;
    let error;
    try {
      result = originalFn.apply(ctx, originalArgs);
    } catch (_error) {
      error = _error;
    }

    return {
      result,
      error,
      span
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
  const connectionParams = {};
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
  const matchResult = connectionUriRegex.exec(connectionString);
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
    .map(pair => pair.trim())
    .forEach(pair =>
      ['host', 'hostaddr', 'port', 'dbname', 'user'].forEach(key =>
        parseConnectStringKeyValuePair(connectionParams, pair, key)
      )
    );
}

function parseConnectStringKeyValuePair(connectionParams, pair, key) {
  if (pair.toLowerCase().indexOf(`${key}=`) === 0) {
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

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
