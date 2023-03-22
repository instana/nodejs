/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const shimmer = require('../../shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
let connectionStr;

const CLOSE_TIMEOUT_IN_MS = process.env.DB2_CLOSE_TIMEOUT_IN_MS || 1000 * 30;

exports.spanName = 'db2';

exports.init = function init() {
  requireHook.onModuleLoad('ibm_db', instrument);
};

/**
 * https://github.com/ibmdb/node-ibm_db/blob/master/APIDocumentation.md
 *
 * DB2 is a C++ implementation with a JS interface.
 * https://github.com/ibmdb/node-ibm_db/blob/master/src/odbc_connection.cpp
 * https://github.com/ibmdb/node-ibm_db/blob/master/src/odbc_statement.cpp
 * https://github.com/ibmdb/node-ibm_db/blob/master/lib/odbc.js
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

function skipTracing(ignoreClsTracing = false) {
  // CASES: instrumentation is disabled, db call is disabled via suppress header
  return (
    cls.skipExitTracing({ isActive, skipIsTracing: true, skipParentSpanCheck: true }) ||
    (ignoreClsTracing ? false : !cls.isTracing())
  );
}

function instrumentOpen(originalFunction) {
  return function instanaInstrumentationOpen() {
    // NOTE: connection.open(fn) will throw an error in the library
    //       we can rely on arguments[0] being the connection string.
    //       There is no other format to pass in the connection.
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

/**
 * We are losing the parentSpan because of the C++ implementation of `beginTransaction`.
 * We were unable to figure out why the context get's lost.
 *
 * We thought it is related to not having used
 * https://github.com/nodejs/nan/blob/main/doc/node_misc.md#api_nan_asyncresource
 *
 * That's why we have to instrument `beginTransaction` and reactivate
 * the span.
 *
 * We do not loose the parentSpan if the customer uses "beginTransactionSync".
 */
function instrumentBeginTransaction(originalFunction) {
  return function instanaInstrumentBeginTransaction() {
    const parentSpan = cls.getCurrentSpan();
    const originalCallback = arguments[0];

    if (typeof originalCallback !== 'function') {
      return originalCallback.apply(this, arguments);
    }

    arguments[0] = cls.ns.bind(function instanaInstrumentBeginTransactionCallback() {
      // NOTE: See function description
      cls.setCurrentSpan(parentSpan);
      return originalCallback.apply(this, arguments);
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
    return instrumentQueryHelper(this, arguments, originalFunction, stmt, false);
  };
}

/**
 * Main difference of prepare and a normal query call:
 * - you can call prepare once and re-use the statement (higher performance)
 *
 * prepare(stmt, cb) is the only possible usage
 */
function instrumentPrepare(originalFunction) {
  return function instanaInstrumentPrepare() {
    const ctx = this;
    const originalArgs = arguments;
    const possibleParentSpan = cls.getCurrentEntrySpan();
    const originalCallback = originalArgs[1];

    if (typeof originalCallback !== 'function') {
      return originalFunction.apply(this, originalArgs);
    }

    originalArgs[1] = function instanaPrepareCallback(err, stmtObject) {
      if (err) return originalCallback.apply(this, arguments);

      instrumentExecuteHelper(ctx, originalArgs, stmtObject, possibleParentSpan);
      return originalCallback.apply(this, arguments);
    };

    return originalFunction.apply(this, originalArgs);
  };
}

function instrumentPrepareSync(originalFunction) {
  return function instanaInstrumentPrepareSync() {
    const ctx = this;
    const originalArgs = arguments;
    const possibleParentSpan = cls.getCurrentEntrySpan();
    const stmtObject = originalFunction.apply(ctx, originalArgs);

    if (stmtObject instanceof Error) {
      return stmtObject;
    }

    instrumentExecuteHelper(ctx, originalArgs, stmtObject, possibleParentSpan);
    return stmtObject;
  };
}

/**
 * ##############################
 * ##### HELPERS
 * ##############################
 */

/**
 * Goal of this function is to capture errors
 * happing when the result is fetched from the database.
 */
function captureFetchError(result, span) {
  if (!result) return;

  const asyncFns = ['fetch', 'fetchAll'];
  const syncFns = ['fetchSync', 'fetchAllSync'];

  asyncFns.forEach(fnName => {
    if (result[fnName]) {
      const originalFn = result[fnName];

      result[fnName] = function instanaFetchOverride() {
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
          return originalFn.apply(this, arguments);
        } catch (caughtErr) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(caughtErr);
          throw caughtErr;
        }
      };
    }
  });

  syncFns.forEach(fnName => {
    if (result[fnName]) {
      const originalFn = result[fnName];

      result[fnName] = function instanaSyncOverride() {
        try {
          const res = originalFn.apply(this, arguments);

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
  });
}

function instrumentQueryHelper(ctx, originalArgs, originalFunction, stmt, isAsync) {
  if (skipTracing()) {
    return originalFunction.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = createSpan(stmt, instrumentQueryHelper);

    // CASE: querySync
    if (!isAsync) {
      try {
        const result = originalFunction.apply(ctx, originalArgs);

        if (result instanceof Error) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(result);
        }

        finishSpan(ctx, result, span);
        return result;
      } catch (e) {
        span.ec = 1;
        span.data.db2.error = tracingUtil.getErrorDetails(e);
        finishSpan(ctx, null, span);
        throw e;
      }
    }

    const customerCallbackIndex =
      // eslint-disable-next-line no-nested-ternary
      originalArgs.length === 2 && typeof originalArgs[1] === 'function'
        ? 1
        : originalArgs.length === 3 && typeof originalArgs[2] === 'function'
        ? 2
        : null;
    const customerCallback = customerCallbackIndex != null ? originalArgs[customerCallbackIndex] : null;

    if (customerCallback) {
      originalArgs[customerCallbackIndex] = function instanaCallback(err) {
        if (err) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(err);
        }

        finishSpan(ctx, null, span);
        return customerCallback.apply(this, arguments);
      };

      return originalFunction.apply(ctx, originalArgs);
    }

    const resultPromise = originalFunction.apply(ctx, originalArgs);

    if (resultPromise && typeof resultPromise.then === 'function' && typeof resultPromise.catch === 'function') {
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
    }
  });
}

function instrumentExecuteHelper(ctx, originalArgs, stmtObject, prepareCallParentSpan) {
  let rememberedParentSpan;

  const canTrace = () => {
    // cls.getCurrentSpan()  : exists if prepare is called outside of the http context
    // prepareCallParentSpan : exists if prepare call is called inside of the http context
    const parentSpan = cls.getCurrentSpan() || prepareCallParentSpan;

    // CASE: There can be only one exit span, skip
    if (constants.isExitSpan(parentSpan)) {
      return false;
    }

    // CASE: we need to remember the original parent span for further `execute` calls
    //       ensure we set the remembered span once in the first call by checking rememberedParentSpan
    if (!parentSpan && !rememberedParentSpan) {
      rememberedParentSpan = parentSpan;
    }

    // cls.isTracing is false when `execute` is minimum called twice
    // then parentSpan is undefined, because there is no current span and no remembered span yet
    if (skipTracing(!parentSpan || !!prepareCallParentSpan)) {
      return false;
    }

    /**
     * If we do not set the parent, the span will have no parent!
     *
     * We have to set the parent span here, reasons:
     *   - execute is called twice
     *   - prepare call happens in http context, we need to remember it
     */
    cls.setCurrentSpan(rememberedParentSpan || parentSpan);
    return true;
  };

  const originalExecuteNonQuerySync = stmtObject.executeNonQuerySync;

  stmtObject.executeNonQuerySync = function instanaExecuteNonQuerySync() {
    return cls.ns.runAndReturn(() => {
      if (!canTrace()) {
        return originalExecuteNonQuerySync.apply(this, arguments);
      }

      const span = createSpan(originalArgs[0], instrumentExecuteHelper);

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
      if (!canTrace()) {
        return originalExecuteSync.apply(this, arguments);
      }

      // NOTE: start one span per execute!
      const span = createSpan(originalArgs[0], instrumentExecuteHelper);

      const result = originalExecuteSync.apply(this, arguments);
      finishSpan(ctx, result, span);
      return result;
    });
  };

  const originalExecute = stmtObject.execute;

  stmtObject.execute = function instanaExecute() {
    return cls.ns.runAndReturn(() => {
      if (!canTrace()) {
        return originalExecute.apply(this, arguments);
      }

      // NOTE: start one span per execute!
      const span = createSpan(originalArgs[0], instrumentExecuteHelper);

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

function instrumentQueryResultHelper(ctx, originalArgs, originalFunction, stmt, isAsync) {
  if (skipTracing()) {
    return originalFunction.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = createSpan(stmt, instrumentQueryResultHelper);

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
    const customerCallback = customerCallbackIndex != null ? originalArgs[customerCallbackIndex] : null;

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

function createSpan(stmt, fn) {
  // eslint-disable-next-line max-len
  // https://github.ibm.com/instana/backend/blob/develop/forge/src/main/java/com/instana/forge/connection/database/ibmdb2/IbmDb2Span.java
  const span = cls.startSpan(exports.spanName, constants.EXIT);
  span.stack = tracingUtil.getStackTrace(fn);
  span.ts = Date.now();
  span.data.db2 = {
    stmt: tracingUtil.shortenDatabaseStatement(stmt),
    dsn: tracingUtil.sanitizeConnectionStr(connectionStr)
  };

  return span;
}

function finishSpan(ctx, result, span) {
  captureFetchError(result, span);

  if (ctx.conn.inTransaction) {
    return handleTransaction(ctx, span);
  }

  // NOTE: This signalises us the end of the trace
  //       Because we want to capture errors till the customer finished the operation.
  //       That's why we want to wait for this call. The ibm docs say, it's required to call it!
  if (result && result.closeSync) {
    const originalCloseSync = result.closeSync;
    let closeSyncCalled = false;
    result.closeSync = function instanaCloseSync() {
      if (closeSyncCalled) return originalCloseSync.apply(this, arguments);

      closeSyncCalled = true;
      span.d = Date.now() - span.ts;
      span.transmit();

      return originalCloseSync.apply(this, arguments);
    };

    // CASE: customer forgets to call `result.closeSync`
    //       search for result.closeSync() in:
    //       https://github.com/ibmdb/node-ibm_db/blob/master/APIDocumentation.md
    //       We need to wait for a long time because any sql query can take long
    setTimeout(() => {
      if (!closeSyncCalled) {
        closeSyncCalled = true;
        span.ec = 1;
        span.data.db2.error = `'result.closeSync' was not called within ${CLOSE_TIMEOUT_IN_MS}ms.`;
        span.d = Date.now() - span.ts;
        span.transmit();
      }
    }, CLOSE_TIMEOUT_IN_MS).unref();
  } else {
    span.d = Date.now() - span.ts;
    span.transmit();
  }
}

function handleTransaction(ctx, span) {
  // NOTE: This is an internal fn to avoid instrumenting commit, rollback separately
  const fns = ['endTransaction', 'endTransactionSync'];

  fns.forEach(fn => {
    const originalFn = ctx.conn[fn];

    // CASE: does fn exist on the lib?
    if (typeof originalFn === 'function') {
      ctx.conn[fn] = function instanaEndTransactionOverride() {
        const originalOnEndCallback = arguments[1];

        // CASE: async
        if (typeof originalOnEndCallback === 'function') {
          arguments[1] = function instanaOnEndOverride(onEndErr) {
            if (onEndErr) {
              span.ec = 1;
              span.data.db2.error = tracingUtil.getErrorDetails(onEndErr) || 'Error not available.';
            }

            span.d = Date.now() - span.ts;
            span.transmit();
            return originalOnEndCallback.apply(this, arguments);
          };

          return originalFn.apply(this, arguments);
        }

        // CASE: sync
        try {
          const result = originalFn.apply(this, arguments);
          span.d = Date.now() - span.ts;
          span.transmit();
          return result;
        } catch (err) {
          span.ec = 1;
          span.data.db2.error = tracingUtil.getErrorDetails(err) || 'Error not available.';
          span.transmit();
          throw err;
        }
      };
    }
  });
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
