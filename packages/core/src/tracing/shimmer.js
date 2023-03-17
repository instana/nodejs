/*
 * (c) Copyright IBM Corp. 2023
 */
// @ts-nocheck

'use strict';

const shimmer = require('shimmer');
let logger;
logger = require('../logger').getLogger('tracing/shimmer', newLogger => {
  logger = newLogger;
});

exports.unwrap = shimmer.unwrap;

/**
 * This wrapper prevents that the application of the customer dies.
 *
 * We won't catch errors which happened e.g. when the result of the original fn comes back.
 * This is fine, because we want to primarly catch errors which happened before the library call.
 */
exports.wrap = (origObject, origMethod, instrumentationWrapperMethod) => {
  shimmer.wrap(origObject, origMethod, function shimmerWrapper(originalFunction) {
    return function () {
      let originalCalled = false;
      const originalThis = this;
      const originalArgs = arguments;

      function instanaOriginalFunctionWrapper() {
        if (originalCalled) return;
        originalCalled = true;
        return originalFunction.apply(this, arguments);
      }

      try {
        return instrumentationWrapperMethod(instanaOriginalFunctionWrapper).apply(originalThis, originalArgs);
      } catch (err) {
        // CASE: not our business, error comes from the target lib
        if (err && err.stack && err.stack.indexOf('instanaOriginalFunctionWrapper') !== -1) {
          throw err;
        }

        // CASE: some libs throw an error like throw ({ message: 'this is a msg' }) which does not create a proper stack
        //       e.g. db2
        if (!err.stack) {
          throw err;
        }

        logger.warn(`An internal error happend in the Instana Node.js collector. Please contact support. ${err.stack}`);

        if (originalCalled) return;
        originalCalled = true;

        // CASE: we pretend that there was no error in our instrumentation, we only log a warning and
        //       ensure tht the customer's application does not die.
        return originalFunction.apply(originalThis, originalArgs);
      }
    };
  });
};
