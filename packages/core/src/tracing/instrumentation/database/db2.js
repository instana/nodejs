/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
let connectionStr;

exports.spanName = 'db2';

exports.init = function init() {
  requireHook.onModuleLoad('ibm_db', instrument);
};

/**
 * https://github.com/ibmdb/node-ibm_db/blob/master/APIDocumentation.md
 *
 * DB2 is a C++ implementation with a JS interface.
 *
 * https://github.com/ibmdb/node-ibm_db/blob/master/src/odbc_connection.cpp
 * The C++ implementation odbc_connection offers the following fn's, which are interesting for us:
 *  createStatement, createStatementSync, query, querySync
 *
 * https://github.com/ibmdb/node-ibm_db/blob/master/src/odbc_statement.cpp
 * The C++ implementation odbc_statemente offers the following fn's, which are interesting for us:
 *  execute, executeSync, executeDirect, executeDirectSync, executeNonQuery,
 *  prepare, prepareSync
 *
 * https://github.com/ibmdb/node-ibm_db/blob/master/lib/odbc.js
 * JS interface offers the following fn's, which are interesting for us:
 * query, querySync
 * prepare, execute, fetch, fetchAll (+ sync variants)
 *
 * queryStream works out of the box, because they use `queryResult` internally
 * https://github.com/ibmdb/node-ibm_db/blob/master/lib/odbc.js#L1068
 */
function instrument(db2) {
  shimmer.wrap(db2.Database.prototype, 'open', instrumentOpen);
  shimmer.wrap(db2.Database.prototype, 'openSync', instrumentOpen);

  shimmer.wrap(db2.Database.prototype, 'query', instrumentQuery);
  shimmer.wrap(db2.Database.prototype, 'querySync', instrumentQuerySync);

  shimmer.wrap(db2.Database.prototype, 'queryResult', instrumentQueryResult);
  shimmer.wrap(db2.Database.prototype, 'queryResultSync', instrumentQueryResultSync);

  shimmer.wrap(db2.Database.prototype, 'beginTransaction', instrumentBeginTransaction);

  shimmer.wrap(db2.Database.prototype, 'prepare', instrumentPrepare);
  shimmer.wrap(db2.Database.prototype, 'prepareSync', instrumentPrepareSync);
}

function instrumentOpen(originalFunction) {
  return function instanaInstrumentationOpen() {
    connectionStr = arguments[0];
    return originalFunction.apply(this, arguments);
  };
}

function instrumentQueryResult(originalFunction) {
  return function instanaInstrumentQueryResult(stmt) {
    return instrumentQueryResultHelper(this, arguments, originalFunction, stmt, true);
  };
}

function instrumentQueryResultSync(originalFunction) {
  return function instanaInstrumentQueryResultSync(stmt) {
    return instrumentQueryResultHelper(this, arguments, originalFunction, stmt, false);
  };
}

function instrumentQueryResultHelper(ctx, originalArgs, originalFunction, stmt, isAsync = false) {
  // CASE: instrumentation is disabled
  // CASE: db call is disabled via suppress header
  if (!isActive || cls.tracingSuppressed() || !cls.isTracing()) {
    return originalFunction.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  // CASE: There can be only one exit span, skip
  if (constants.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    // eslint-disable-next-line max-len
    // https://github.ibm.com/instana/backend/blob/develop/forge/src/main/java/com/instana/forge/connection/database/ibmdb2/IbmDb2Span.java
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentQuery);
    span.d = Date.now() - span.ts;
    span.data.db2 = {
      stmt: tracingUtil.shortenDatabaseStatement(stmt),
      dsn: connectionStr
    };

    if (!isAsync) {
      try {
        const result = originalFunction.apply(ctx, originalArgs);
        finishSpan(ctx, result, span);
        return result;
      } catch (err) {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(err);
        finishSpan(ctx, null, span);
        return err;
      }
    }

    const customerCallbackIndex =
      // eslint-disable-next-line no-nested-ternary
      originalArgs.length === 2 && typeof originalArgs[1] === 'function'
        ? 1
        : originalArgs.length === 3 && typeof originalArgs[2] === 'function'
        ? 2
        : null;
    const customerCallback = originalArgs[customerCallbackIndex];

    if (customerCallback) {
      originalArgs[customerCallbackIndex] = function instanaCallback(err) {
        if (err) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(err);
        }

        const result = customerCallback.apply(this, arguments);
        finishSpan(ctx, result, span);
        return result;
      };

      return originalFunction.apply(ctx, originalArgs);
    }
  });
}

/**
 * We are losing the parentSpan because of the C++ implementation of `beginTransaction`.
 * We were unable to figure out why the context get's lost.
 *
 * We thought it is related to not having used
 * https://github.com/nodejs/nan/blob/main/doc/node_misc.md#api_nan_asyncresource
 *
 * That's why we have to instrument `beginTransaction` and reactivate
 * the span.
 */
function instrumentBeginTransaction(originalFunction) {
  return function instanaInstrumentationBeginTransaction(cb) {
    const parentSpan = cls.getCurrentSpan();

    arguments[0] = cls.ns.bind(function instanaInstrumentationBeginTransactionCallback() {
      // NOTE: See function description
      cls.setCurrentSpan(parentSpan);
      return cb.apply(this, arguments);
    });

    return originalFunction.apply(this, arguments);
  };
}

function instrumentQuery(originalFunction) {
  return function (stmt) {
    return instrumentQueryHelper(this, arguments, originalFunction, stmt, true);
  };
}

function instrumentQuerySync(originalFunction) {
  return function (stmt) {
    return instrumentQueryHelper(this, arguments, originalFunction, stmt);
  };
}

function instrumentQueryHelper(ctx, originalArgs, originalFunction, stmt, isAsync = false) {
  // CASE: instrumentation is disabled
  // CASE: db call is disabled via suppress header
  if (!isActive || cls.tracingSuppressed() || !cls.isTracing()) {
    return originalFunction.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  // CASE: There can be only one exit span, skip
  if (constants.isExitSpan(parentSpan)) {
    return originalFunction.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    // eslint-disable-next-line max-len
    // https://github.ibm.com/instana/backend/blob/develop/forge/src/main/java/com/instana/forge/connection/database/ibmdb2/IbmDb2Span.java
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.d = Date.now() - span.ts;
    span.stack = tracingUtil.getStackTrace(instrumentQuery);
    span.data.db2 = {
      stmt: tracingUtil.shortenDatabaseStatement(stmt),
      dsn: connectionStr
    };

    // CASE: e.g. querySync
    if (!isAsync) {
      let result;
      let err;

      try {
        result = originalFunction.apply(ctx, originalArgs);

        if (result instanceof Error) {
          err = result;
        }
      } catch (e) {
        err = e;
      }

      if (err) {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(err);
      }

      finishSpan(ctx, result, span);

      if (err) {
        throw err;
      }

      return result;
    }

    const customerCallbackIndex =
      // eslint-disable-next-line no-nested-ternary
      originalArgs.length === 2 && typeof originalArgs[1] === 'function'
        ? 1
        : originalArgs.length === 3 && typeof originalArgs[2] === 'function'
        ? 2
        : null;
    const customerCallback = originalArgs[customerCallbackIndex];

    if (customerCallback) {
      originalArgs[customerCallbackIndex] = function instanaCallback(err) {
        if (err) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(err);
        }

        finishSpan(ctx, null, span);

        if (customerCallback) {
          return customerCallback.apply(this, arguments);
        }
      };

      return originalFunction.apply(ctx, originalArgs);
    }

    const resultPromise = originalFunction.apply(ctx, originalArgs);

    resultPromise
      .then(result => {
        finishSpan(ctx, result, span);
        return result;
      })
      .catch(err => {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(err);
        finishSpan(ctx, null, span);
        return err;
      });

    return resultPromise;
  });
}

function handleTransaction(ctx, span) {
  const originalEndTransaction = ctx.conn.endTransaction;
  const originalEndTransactionSync = ctx.conn.endTransactionSync;

  // NOTE: This is an internal fn to avoid instrumenting commit, rollback separately
  ctx.conn.endTransaction = function instanaEndTransaction(rollback) {
    if (rollback) {
      span.cancel();
    } else {
      span.transmit();
    }

    return originalEndTransaction.apply(this, arguments);
  };

  ctx.conn.endTransactionSync = function instanaEndTransactionSync(rollback) {
    if (rollback) {
      span.cancel();
    } else {
      span.transmit();
    }

    return originalEndTransactionSync.apply(this, arguments);
  };
}

function instrumentExecuteHelper(ctx, originalArgs, stmtObject, parentSpan) {
  const originalExecuteNonQuerySync = stmtObject.executeNonQuerySync;

  stmtObject.executeNonQuerySync = function instanaExecuteNonQuerySync() {
    return cls.ns.runAndReturn(() => {
      cls.setCurrentSpan(parentSpan);

      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.d = Date.now() - span.ts;
      span.stack = tracingUtil.getStackTrace(instrumentExecuteHelper);
      span.data.db2 = {
        stmt: tracingUtil.shortenDatabaseStatement(originalArgs[0]),
        dsn: connectionStr
      };

      // NOTE: returns row count
      try {
        const result = originalExecuteNonQuerySync.apply(this, arguments);
        finishSpan(ctx, result, span);
        return result;
      } catch (err) {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(err);
        finishSpan(ctx, null, span);
        return err;
      }
    });
  };

  const originalExecuteSync = stmtObject.executeSync;
  stmtObject.executeSync = function instanaExecuteSync() {
    return cls.ns.runAndReturn(() => {
      cls.setCurrentSpan(parentSpan);

      // NOTE: start one span per execute!
      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.d = Date.now() - span.ts;
      span.stack = tracingUtil.getStackTrace(instrumentExecuteHelper);
      span.data.db2 = {
        stmt: tracingUtil.shortenDatabaseStatement(originalArgs[0]),
        dsn: connectionStr
      };

      const result = originalExecuteSync.apply(this, arguments);
      finishSpan(ctx, result, span);
      return result;
    });
  };

  const originalExecute = stmtObject.execute;

  stmtObject.execute = function instanaExecute() {
    return cls.ns.runAndReturn(() => {
      // NOTE: We have to set the initial http parent span here
      //       because we start the context (runAndReturn) in execute and not in prepare.
      //       If the customer calls execute twice, we'd loose parent span otherwise.
      cls.setCurrentSpan(parentSpan);

      // NOTE: start one span per execute!
      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.d = Date.now() - span.ts;
      span.stack = tracingUtil.getStackTrace(instrumentExecuteHelper);
      span.data.db2 = {
        stmt: tracingUtil.shortenDatabaseStatement(originalArgs[0]),
        dsn: connectionStr
      };

      const args = arguments;
      const origCallbackIndex =
        // eslint-disable-next-line no-nested-ternary
        args.length === 1 && typeof args[0] === 'function'
          ? 0
          : args.length === 2 && typeof args[1] === 'function'
          ? 1
          : null;
      const origCallback = args[origCallbackIndex];

      args[origCallbackIndex] = function instanaExecuteCallback(executeErr, result) {
        if (executeErr) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(executeErr);
          finishSpan(ctx, null, span);
          return origCallback.apply(this, arguments);
        }

        finishSpan(ctx, result, span);
        return origCallback.apply(this, arguments);
      };

      return originalExecute.apply(this, arguments);
    });
  };
}

/**
 * Main difference prepare and query:
 * - you can call prepare once an re-use the statement (higher performance)
 */
function instrumentPrepare(originalFunction) {
  return function instanaPrepare() {
    const ctx = this;
    const originalArgs = arguments;

    // CASE: instrumentation is disabled
    // CASE: db call is disabled via suppress header
    if (!isActive || cls.tracingSuppressed() || !cls.isTracing()) {
      return originalFunction.apply(ctx, originalArgs);
    }

    const parentSpan = cls.getCurrentSpan();

    // CASE: There can be only one exit span, skip
    if (constants.isExitSpan(parentSpan)) {
      return originalFunction.apply(ctx, originalArgs);
    }

    const originalCallback = originalArgs[1];
    originalArgs[1] = cls.ns.bind(function instanaCallback(err, stmtObject) {
      if (err) return originalCallback.apply(this, arguments);

      instrumentExecuteHelper(ctx, originalArgs, stmtObject, parentSpan);
      return originalCallback.apply(this, arguments);
    });

    return originalFunction.apply(this, originalArgs);
  };
}

function instrumentPrepareSync(originalFunction) {
  return function instanaPrepareSync() {
    const ctx = this;
    const originalArgs = arguments;

    // CASE: instrumentation is disabled
    // CASE: db call is disabled via suppress header
    if (!isActive || cls.tracingSuppressed() || !cls.isTracing()) {
      return originalFunction.apply(ctx, originalArgs);
    }

    const parentSpan = cls.getCurrentSpan();

    // CASE: There can be only one exit span, skip
    if (constants.isExitSpan(parentSpan)) {
      return originalFunction.apply(ctx, originalArgs);
    }

    const stmtObject = originalFunction.apply(ctx, originalArgs);

    if (stmtObject instanceof Error) {
      return stmtObject;
    }

    instrumentExecuteHelper(ctx, originalArgs, stmtObject, parentSpan);
    return stmtObject;
  };
}

function captureFetchError(result, span) {
  if (!result) return;

  if (result.fetch) {
    // NOTE: Goal is to recognise when an error occurs on fetch!
    // NOTE: Customer does not have to call fetch!
    const originalFetch = result.fetch;
    result.fetch = function instanaFetch() {
      const argsFetch = arguments;
      const fetchIndex =
        // eslint-disable-next-line no-nested-ternary
        argsFetch.length === 1 && typeof argsFetch[0] === 'function'
          ? 0
          : argsFetch.length === 2 && typeof argsFetch[1] === 'function'
          ? 1
          : null;
      const fetchCb = argsFetch[fetchIndex];

      argsFetch[fetchIndex] = function instanaFetchCb(fetchCbErr) {
        if (fetchCbErr) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(fetchCbErr);
        }

        return fetchCb.apply(this, arguments);
      };

      try {
        return originalFetch.apply(this, arguments);
      } catch (e) {
        // CASE: wrong arguments etc.
        // TODO: Discuss if we want to trace this call or not.
        // -> prepare success, execute success, fetch error because of wrong usage
        span.cancel();
        throw e;
      }
    };
  }

  if (result.fetchAll) {
    const originalFetchAll = result.fetchAll;
    result.fetchAll = function instanaFetchAll() {
      const argsFetchAll = arguments;
      const fetchAllIndex =
        // eslint-disable-next-line no-nested-ternary
        argsFetchAll.length === 1 && typeof argsFetchAll[0] === 'function'
          ? 0
          : argsFetchAll.length === 2 && typeof argsFetchAll[1] === 'function'
          ? 1
          : null;
      const fetchAllCb = argsFetchAll[fetchAllIndex];

      argsFetchAll[fetchAllIndex] = function instanaFetchCb(fetchAllCbErr) {
        if (fetchAllCbErr) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(fetchAllCbErr);
        }

        return fetchAllCb.apply(this, arguments);
      };

      try {
        return originalFetchAll.apply(this, arguments);
      } catch (e) {
        // CASE: wrong arguments etc.
        span.cancel();
        throw e;
      }
    };
  }

  if (result.fetchSync) {
    const originalFetchSync = result.fetchSync;

    // TODO: discuss if okay
    if (process.env.INSTANA_ATTACH_FETCH_SYNC) {
      result.originalFetchSync = originalFetchSync;
    }

    result.fetchSync = function instanaFetchSync() {
      try {
        let fn = originalFetchSync;
        if (process.env.INSTANA_ATTACH_FETCH_SYNC) {
          fn = result.originalFetchSync;
        }

        const res = fn.apply(this, arguments);

        if (res instanceof Error) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(res);
        }
        return res;
      } catch (err) {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(err);

        return err;
      }
    };
  }

  if (result.fetchAllSync) {
    const originalFetchAllSync = result.fetchAllSync;
    result.fetchAllSync = function instanaFetchAllSync() {
      try {
        const res = originalFetchAllSync.apply(this, arguments);

        if (res instanceof Error) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(res);
        }

        return res;
      } catch (err) {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(err);

        return err;
      }
    };
  }
}

function finishSpan(ctx, result, span) {
  captureFetchError(result, span);

  if (ctx.conn.inTransaction) {
    handleTransaction(ctx, span);
  }

  const internalFinishSpan = () => {
    if (!ctx.conn.inTransaction) span.transmit();
  };

  if (result && result.closeSync) {
    const originalCloseSync = result.closeSync;
    let closeSyncCalled = false;
    result.closeSync = function instanaCloseSync() {
      closeSyncCalled = true;
      internalFinishSpan();
      return originalCloseSync.apply(this, arguments);
    };

    // CASE: customer forgets to call `closeSync`
    // TODO: discuss timeout length and in general
    setTimeout(() => {
      if (!closeSyncCalled) {
        internalFinishSpan();
      }
    }, 500);
  } else {
    internalFinishSpan();
  }
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
