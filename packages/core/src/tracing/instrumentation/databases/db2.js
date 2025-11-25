/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

const technology = 'db2';

const CLOSE_TIMEOUT_IN_MS = process.env.DB2_CLOSE_TIMEOUT_IN_MS || 1000 * 30;

exports.spanName = 'ibmdb2';

exports.init = function init() {
  hook.onModuleLoad('ibm_db', instrument);
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

/**
 * We need to set `skipIsTracing` check for db2, because of e.g. prepare
 * statements or transactions. We don't always know if we are tracing or not.
 */
function skipTracing(ignoreClsTracing = false) {
  const skipExitResult = cls.skipExitTracing({
    isActive,
    skipIsTracing: true,
    skipParentSpanCheck: true,
    extendedResponse: true
  });

  const isTracing = cls.isTracing();

  // CASE: `cls.skipExitTracing` decided to skip, respect that
  if (skipExitResult.skip) return true;

  // CASE: the target parent function wants us to ignore cls.isTracing
  //       because e.g. we don't know if we trace (parent got lost)
  if (ignoreClsTracing) return false;

  // CASE: We ignore if tracing or not for `allowRootExitSpan`. See cls file.
  if (skipExitResult.allowRootExitSpan) return false;

  return !isTracing;
}

function instrumentOpen(originalFunction) {
  return function instanaInstrumentationOpen() {
    // NOTE: connection.open(fn) will throw an error in the library
    //       we can rely on arguments[0] being the connection string.
    //       There is no other format to pass in the connection.
    this._instanaConnectionString = arguments[0];
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
      // NOTE: We need to ensure that there is a parentSpan, see 'allowRootExitSpan: true'.
      if (parentSpan) {
        cls.setCurrentSpan(parentSpan);
      }

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
            const errorDetails = tracingUtil.getErrorDetails(fetchCbErr);
            span.data[technology].error = errorDetails;
          }

          return fetchCb.apply(this, arguments);
        };

        try {
          return originalFn.apply(this, arguments);
        } catch (caughtErr) {
          span.ec = 1;
          const errorDetails = tracingUtil.getErrorDetails(caughtErr);

          span.data[technology].error = errorDetails;
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
            const errorDetails = tracingUtil.getErrorDetails(res);
            span.data[technology].error = errorDetails;
          }
          return res;
        } catch (err) {
          span.ec = 1;
          const errorDetails = tracingUtil.getErrorDetails(err);
          span.data[technology].error = errorDetails;

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
    const span = createSpan(stmt, instrumentQueryHelper, ctx._instanaConnectionString);

    // CASE: querySync
    if (!isAsync) {
      try {
        const result = originalFunction.apply(ctx, originalArgs);

        if (result instanceof Error) {
          span.ec = 1;
          const errorDetails = tracingUtil.getErrorDetails(result);
          span.data[technology].error = errorDetails;
        }

        finishSpan(ctx, result, span);
        return result;
      } catch (e) {
        span.ec = 1;
        const errorDetails = tracingUtil.getErrorDetails(e);
        span.data[technology].error = errorDetails;
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
          const errorDetails = tracingUtil.getErrorDetails(err);
          span.data[technology].error = errorDetails;
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
          const errorDetails = tracingUtil.getErrorDetails(err);
          span.data[technology].error = errorDetails;
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

    // CASE 1: `cls.isTracing` is false when `execute` is minimum called twice, because
    // because there is NO current span and no remembered span.
    // We skip checking `cls.isTracing` because we want to trace the second call.
    //
    // CASE 2: `allowRootExitSpan: true` is set, we might not have an entry span at all on
    //         the first execute call.
    if (skipTracing(!parentSpan || !!prepareCallParentSpan)) {
      return false;
    }

    /**
     * If we do not set the parent, the span will have no parent!
     *
     * We have to set the parent span here, reasons:
     *   - execute is called twice
     *   - prepare call happens in http context, we need to remember it
     *
     * CASE: When setting `allowRootExitSpan: true`, the parentSpan might be null.
     */
    const parentToSetAsCurrent = rememberedParentSpan || parentSpan;
    if (parentToSetAsCurrent) cls.setCurrentSpan(parentToSetAsCurrent);
    return true;
  };

  const originalExecuteNonQuerySync = stmtObject.executeNonQuerySync;

  stmtObject.executeNonQuerySync = function instanaExecuteNonQuerySync() {
    return cls.ns.runAndReturn(() => {
      if (!canTrace()) {
        return originalExecuteNonQuerySync.apply(this, arguments);
      }

      const span = createSpan(originalArgs[0], instrumentExecuteHelper, ctx._instanaConnectionString);

      // NOTE: returns row count
      try {
        const result = originalExecuteNonQuerySync.apply(this, arguments);
        finishSpan(ctx, result, span);
        return result;
      } catch (err) {
        span.ec = 1;
        const errorDetails = tracingUtil.getErrorDetails(err);
        span.data[technology].error = errorDetails;
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
      const span = createSpan(originalArgs[0], instrumentExecuteHelper, ctx._instanaConnectionString);

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
      const span = createSpan(originalArgs[0], instrumentExecuteHelper, ctx._instanaConnectionString);

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
          const errorDetails = tracingUtil.getErrorDetails(executeErr);
          span.data[technology].error = errorDetails;
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
    const span = createSpan(stmt, instrumentQueryResultHelper, ctx._instanaConnectionString);

    if (!isAsync) {
      try {
        const result = originalFunction.apply(ctx, originalArgs);
        finishSpan(ctx, result, span);
        return result;
      } catch (err) {
        span.ec = 1;
        const errorDetails = tracingUtil.getErrorDetails(err);
        span.data[technology].error = errorDetails;
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
          const errorDetails = tracingUtil.getErrorDetails(err);
          span.data[technology].error = errorDetails;
        }

        const result = customerCallback.apply(this, arguments);
        finishSpan(ctx, result, span);
        return result;
      };

      return originalFunction.apply(ctx, originalArgs);
    }
  });
}

function createSpan(stmt, fn, connectionStr) {
  // eslint-disable-next-line max-len
  // https://github.ibm.com/instana/backend/blob/develop/forge/src/main/java/com/instana/forge/connection/database/ibmdb2/IbmDb2Span.java
  const span = cls.startSpan({
    spanName: exports.spanName,
    kind: constants.EXIT
  });
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
        const errorDetails = `'result.closeSync' was not called within ${CLOSE_TIMEOUT_IN_MS}ms.`;
        span.data[technology].error = errorDetails;
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
              const errorDetails = tracingUtil.getErrorDetails(onEndErr) || 'Error not available.';
              span.data[technology].error = errorDetails;
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
          const errorDetails = tracingUtil.getErrorDetails(err) || 'Error not available.';
          span.data[technology].error = errorDetails;
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
