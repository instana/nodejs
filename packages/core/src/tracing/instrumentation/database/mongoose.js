/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const shimmer = require('shimmer');

let logger;
logger = require('../../../logger').getLogger('tracing/grpc', newLogger => {
  logger = newLogger;
});

const requireHook = require('../../../util/requireHook');
const cls = require('../../cls');

exports.init = function () {
  requireHook.onModuleLoad('mongoose', exports.instrument);
};

// This instruments the Aggregate object exported by Mongoose. The Mongoose library uses the standard MongoDB driver
// under the hood and thus would not need custom instrumentation to capture MongoDB exit spans. But: Its Aggregate
// object is a custom thenable, and async_hooks currently does not propagate the async context for those (only for
// actual promise instances).
//
// Thus, we loose async context in Mongoose.Model.aggregate(...).then.
//
// To work around that issue, we attach the async context that is active when _creating_ the Aggregate object and
// restore it in Aggregate#then.

exports.instrument = function instrument(Mongoose) {
  if (!Mongoose.Model || !Mongoose.Model.aggregate) {
    logger.debug('Failed to instrument Mongoose, no Model or Model.aggregate property.');
    return;
  }
  const originalAggregate = Mongoose.Model.aggregate;

  // Instrument Mongoose.Model#aggregate to attach the async context.
  Mongoose.Model.aggregate = function aggregate() {
    const aggr = originalAggregate.apply(this, arguments);
    if (!aggr) {
      return aggr;
    }
    if (typeof aggr.then === 'function' && typeof aggr.catch === 'function') {
      aggr.__inctx = cls.getAsyncContext();
      shimmer.wrap(aggr, 'then', instrumentThenOrCatch);
      shimmer.wrap(aggr, 'catch', instrumentThenOrCatch);
    }

    return aggr;
  };
};

function instrumentThenOrCatch(original) {
  return function instrumentedThenOrCatch() {
    if (!this.__inctx) {
      return original.apply(this, arguments);
    } else {
      const originalThis = this;
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return cls.runInAsyncContext(this.__inctx, () => original.apply(originalThis, originalArgs));
    }
  };
}

exports.activate = function () {
  // This instrumentation does not record spans on its own, it just helps propagating the async context. Thus the
  // instrumentation is always on and cannot be activted or deactivated.
};

exports.deactivate = function () {
  // This instrumentation does not record spans on its own, it just helps propagating the async context. Thus the
  // instrumentation is always on and cannot be activted or deactivated.
};
