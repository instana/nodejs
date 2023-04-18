/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const shimmer = require('../../shimmer');
const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;
const bucketLookup = {};

exports.spanName = 'couchbase';

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

exports.init = function init() {
  requireHook.onModuleLoad('couchbase', instrument);

  // The couchbase client talks to some Couchbase services via http directly from the JS implementation.
  // e.g. search service
  // https://github.com/couchbase/couchnode/blob/e855b094cd1b0140ffefc40f32a828b9134d181c/lib/searchindexmanager.ts#L243
  // We could instrument some traffic via the HttpExecutor library, but then we would not capture the connected host.
  // requireHook.onFileLoad(/couchbase\/dist\/httpexecutor/, instrumentHttpRequest);
};

/*
function instrumentHttpRequest(lib) {
  shimmer.wrap(lib.HttpExecutor.prototype, 'request', function (orig) {
    return function instanaRequest() {
      return orig.apply(this, arguments);
    };
  });
}
*/

// CRUD operations:
// https://github.com/couchbase/couchnode/blob/e855b094cd1b0140ffefc40f32a828b9134d181c/src/connection_autogen.cpp#L210
function instrument(cb) {
  // NOTE: we could instrument `cb.Collection.prototype` here, but we want to instrument each cluster connection.
  shimmer.wrap(cb, 'connect', instrumentConnect);
}

function instrumentConnect(originalConnect) {
  return function instanaConnect() {
    const originalThis = this;
    const originalArgs = arguments;

    // NOTE: bucket type needs to be fetched async
    //       we start fetching it as soon as the cluster is connected
    //       we want to fetch the type once
    //       worst case: first query is too fast and get's bucketType empty
    const getBucketType = (c, n) => {
      // CASE: already cached
      if (n in bucketLookup) {
        return () => {
          return bucketLookup[n];
        };
      }

      let bucketType = '';
      const bucketMng = c.buckets();

      bucketMng
        .getBucket(n)
        .then(b => {
          if (b && b.bucketType) {
            bucketType = b.bucketType;
            bucketLookup[n] = bucketType;
          }
        })
        .catch(() => {
          // ignore
        });

      return () => {
        return bucketType;
      };
    };

    const instrumentCluster = (cluster, connectionStr) => {
      if (!cluster) return;

      shimmer.wrap(cluster, 'searchQuery', instrumentOperation.bind(null, { connectionStr, sqlType: 'SEARCHQUERY' }));

      const origBucket = cluster.bucket;
      cluster.bucket = function instanaBucket() {
        const bucket = origBucket.apply(this, arguments);
        const origScope = bucket.scope;

        bucket.scope = function instanaScope() {
          const scope = origScope.apply(this, arguments);
          const origCollection = scope.collection;

          scope.collection = function instanaCollection() {
            const collection = origCollection.apply(this, arguments);

            const bucketName = bucket._name;
            const getBucketTypeFn = getBucketType(cluster, bucketName);

            // `this._conn` === c++ implementation
            // https://github.com/couchbase/couchnode/blob/v4.2.2/lib/collection.ts#L433
            // each operation calls e.g. `this._conn.upsert`
            // there is no generic fn such as `this._conn.query`
            // the c++ impl has a centralised `executeOp` fn
            // https://github.com/couchbase/couchnode/blob/v4.2.2/src/connection.hpp#L208
            ['get', 'remove', 'insert', 'upsert', 'replace', 'mutateIn', 'lookupIn', 'exists', 'getAndTouch'].forEach(
              op => {
                shimmer.wrap(
                  collection,
                  op,
                  instrumentOperation.bind(null, {
                    connectionStr,
                    bucketName,
                    getBucketType: getBucketTypeFn,
                    sqlType: op.toUpperCase()
                  })
                );
              }
            );

            return collection;
          };

          shimmer.wrap(scope, 'query', instrumentOperation.bind(null, { connectionStr, sqlType: 'QUERY' }));

          return scope;
        };

        return bucket;
      };

      const origSearchIndex = cluster.searchIndexes;
      cluster.searchIndexes = function instanaSearchIndexes() {
        const searchIndexes = origSearchIndex.apply(this, arguments);

        // We could wrap `searchIndexes._http.request`, but has no real benifit because we would parse the http attr.
        // eslint-disable-next-line max-len
        // https://github.com/couchbase/couchnode/blob/e855b094cd1b0140ffefc40f32a828b9134d181c/lib/searchindexmanager.ts#L280
        ['getIndex', 'upsertIndex', 'dropIndex', 'getAllIndexes'].forEach(fnName => {
          shimmer.wrap(searchIndexes, fnName, function instanaInstrumentOperationWrapped(original) {
            return function instanaInstrumentOperationWrappedInner() {
              const origThis = this;
              const origArgs = arguments;

              const bucketOpts = origArgs[0];
              let bucketName;
              let getBucketTypeFn;

              // CASE: upsert
              if (bucketOpts && bucketOpts.sourceName) {
                bucketName = bucketOpts.sourceName;
                getBucketTypeFn = getBucketType(cluster, bucketName);
              }

              return instrumentOperation(
                {
                  connectionStr,
                  sqlType: fnName.toUpperCase(),
                  bucketName,
                  getBucketType: getBucketTypeFn,
                  resultHandler: (span, result) => {
                    if (result && result.sourceName) {
                      // CASE: getindex
                      span.data.couchbase.bucket = result.sourceName;
                      span.data.couchbase.type = bucketLookup[span.data.couchbase.bucket] || '';
                    } else if (result && Array.isArray(result) && result.length > 0) {
                      // CASE: getAllIndexes
                      span.data.couchbase.bucket = result[0].sourceName;
                      span.data.couchbase.type = bucketLookup[span.data.couchbase.bucket] || '';
                    }
                  }
                },
                original
              ).apply(origThis, origArgs);
            };
          });
        });

        return searchIndexes;
      };

      const origQueryIndexes = cluster.queryIndexes;
      cluster.queryIndexes = function instanaQueryIndexes() {
        const queryIndexes = origQueryIndexes.apply(this, arguments);

        if (!queryIndexes._manager) return queryIndexes;

        ['createIndex', 'dropIndex', 'getAllIndexes'].forEach(fnName => {
          shimmer.wrap(queryIndexes._manager, fnName, function instanaInstrumentOperationWrapped(original) {
            return function instanaInstrumentOperationWrappedInner() {
              const origThis = this;
              const origArgs = arguments;

              const bucketName = origArgs[0];
              const getBucketTypeFn = getBucketType(cluster, bucketName);

              return instrumentOperation(
                {
                  connectionStr,
                  sqlType: fnName.toUpperCase(),
                  bucketName,
                  getBucketType: getBucketTypeFn
                },
                original
              ).apply(origThis, origArgs);
            };
          });
        });

        return queryIndexes;
      };

      const origTransactions = cluster.transactions;
      cluster.transactions = function instanaTransactions() {
        const transactions = origTransactions.apply(this, arguments);

        const origRun = transactions.run;
        transactions.run = function instanaRun() {
          const { originalCallback, callbackIndex } = findCallback(arguments);

          if (callbackIndex >= 0) {
            arguments[callbackIndex] = function instanaRunCallback(attempt) {
              ['get', 'remove', 'insert', 'replace', 'query'].forEach(op => {
                // CASE: attempt is an object, which is reused.
                if (attempt[op].__wrapped) return;

                shimmer.wrap(attempt, op, original => {
                  return function instanaInstrumentOperationInner() {
                    const originalThis1 = this;
                    const originalArgs1 = arguments;
                    const obj = originalArgs1[0];
                    let bucketName;
                    let getBucketTypeFn;

                    if (obj && obj._scope && obj._scope._bucket) {
                      bucketName = obj._scope._bucket._name;
                      getBucketTypeFn = getBucketType(cluster, bucketName);
                    } else if (obj && obj.id && obj.id.bucket) {
                      bucketName = obj.id.bucket;
                      getBucketTypeFn = getBucketType(cluster, bucketName);
                    }

                    return instrumentOperation(
                      {
                        connectionStr,
                        bucketName,
                        getBucketType: getBucketTypeFn,
                        sqlType: op.toUpperCase()
                      },
                      original
                    ).apply(originalThis1, originalArgs1);
                  };
                });
              });

              [{ 0: { fnName: '_commit', sql: 'COMMIT' } }, { 0: { fnName: '_rollback', sql: 'ROLLBACK' } }].forEach(
                obj => {
                  // CASE: attempt is an object, which is reused.
                  if (attempt[obj[0].fnName].__wrapped) return;

                  shimmer.wrap(attempt, obj[0].fnName, originalFn => {
                    return function instanaCommitRollbackOverride() {
                      const span = cls.startSpan(exports.spanName, constants.EXIT);
                      span.stack = tracingUtil.getStackTrace(instanaCommitRollbackOverride);
                      span.ts = Date.now();
                      span.data.couchbase = {
                        hostname: connectionStr,
                        bucket: '',
                        type: '',
                        sql: obj[0].sql
                      };

                      const result = originalFn.apply(this, arguments);

                      if (result.then && result.catch && result.finally) {
                        result
                          .catch(err => {
                            span.ec = 1;
                            span.data.couchbase.error = tracingUtil.getErrorDetails(err);
                          })
                          .finally(() => {
                            span.d = Date.now() - span.ts;
                            span.transmit();
                          });
                      } else {
                        span.cancel();
                      }

                      return result;
                    };
                  });
                }
              );

              return originalCallback.apply(this, arguments);
            };
          }

          return origRun.apply(this, arguments);
        };

        return transactions;
      };

      shimmer.wrap(cluster, 'query', instrumentOperation.bind(null, { connectionStr, sqlType: 'QUERY' }));
      shimmer.wrap(
        cluster,
        'analyticsQuery',
        instrumentOperation.bind(null, {
          connectionStr,
          sqlType: 'ANALYTICSQUERY',
          resultHandler: (span, result) => {
            if (result && result.rows && result.rows.length > 0 && result.rows[0].BucketName) {
              span.data.couchbase.bucket = result.rows[0].BucketName;
              span.data.couchbase.type = bucketLookup[span.data.couchbase.bucket] || '';
            }
          }
        })
      );
    };

    const originalCallback = originalArgs[2];

    if (originalCallback && typeof originalCallback === 'function') {
      originalArgs[2] = function instanaCallback() {
        instrumentCluster(arguments[1], originalArgs[0]);

        return originalCallback.apply(this, arguments);
      };

      return originalConnect.apply(originalThis, originalArgs);
    }

    const prom = originalConnect.apply(originalThis, originalArgs);

    if (prom && prom.then) {
      prom.then(cluster => {
        instrumentCluster(cluster);
        return cluster;
      });
    }

    return prom;
  };
}

function findCallback(originalArgs) {
  let originalCallback;
  let callbackIndex = -1;

  for (let i = 0; i < originalArgs.length; i++) {
    if (typeof originalArgs[i] === 'function') {
      originalCallback = originalArgs[i];
      callbackIndex = i;
      break;
    }
  }

  return {
    originalCallback,
    callbackIndex
  };
}

function instrumentOperation({ connectionStr, bucketName, getBucketType, sqlType, resultHandler }, original) {
  return function instanaOpOverride() {
    const originalThis = this;
    const originalArgs = arguments;

    if (cls.skipExitTracing({ isActive })) {
      return original.apply(originalThis, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const bucketType = getBucketType && getBucketType();
      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.stack = tracingUtil.getStackTrace(original);
      span.ts = Date.now();
      span.data.couchbase = {
        hostname: connectionStr,
        bucket: bucketName || '',
        type: bucketType || '',
        sql: sqlType
      };

      const { originalCallback, callbackIndex } = findCallback(originalArgs);

      if (callbackIndex < 0) {
        const prom = original.apply(originalThis, originalArgs);

        if (prom.then && prom.catch) {
          prom
            .then(result => {
              if (resultHandler) {
                resultHandler(span, result);
              }

              return result;
            })
            .catch(err => {
              span.ec = 1;
              span.data.couchbase.error = tracingUtil.getErrorDetails(err);
            })
            .finally(() => {
              span.d = Date.now() - span.ts;
              span.transmit();
            });
        }

        return prom;
      } else {
        originalArgs[callbackIndex] = cls.ns.bind(function instanaCallback(err, result) {
          if (err) {
            span.ec = 1;
            span.data.couchbase.error = tracingUtil.getErrorDetails(err);
          }

          if (resultHandler) {
            resultHandler(span, result);
          }

          span.d = Date.now() - span.ts;
          span.transmit();

          return originalCallback.apply(this, arguments);
        });

        return original.apply(originalThis, originalArgs);
      }
    });
  };
}
