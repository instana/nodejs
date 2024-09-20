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
 * This wrapper around the shimmer library prevents that the application of the customer terminates when one of our
 * instrumentations throws an error _in the instrumencation code_. Errors that are produced by the application or the
 * instrumented library are re-thrown (we do not want to change the behavior of the application under monitoring).
 *
 * We won't catch errors which happened e.g. when the result of the original fn comes back.
 * This is fine, because we want to primarly catch errors which happened before the library call.
 *
 * ----------------------------------------------------------------
 *
 * Assuming the following flow for an uninstrumented application:
 *
 * application code -> original library function
 *
 * After applying instrumentation with the help of this wrapper, the flow will looks like this:
 *
 * application code -> (anonymous function in line 24 which we might want to give a name, see below) ->
 * instrumentationWrapperMethod (e.g. shimQuery from our mysql instrumentation) ->
 * instanaOriginalFunctionWrapper -> original library function.
 *
 * This serves two purposes:
 * 1. We can insert one central try-catch into the flow that is applied for all our instrumentations.
 * 2. The additional named function instanaOriginalFunctionWrapper enables us to inspect the stack trace of errors
 *    that are thrown and thus determine whether they have been thrown in our instrumentation code or in the
 *    instrumented library.
 */
exports.wrap = (origObject, origMethod, instrumentationWrapperMethod) => {
  // NOTE: We do not want to wrap a function of a library twice.
  // CASE: Some instrumentations are really complex such as redis.
  //       e.g. there is the concept of client and/or cluster connections.
  //       We might use the same underlying object, but we call `.wrap` twice in the instrumentation
  //       but we can't control it.
  if (origObject[origMethod].__wrapped) {
    logger.debug(`Method ${origMethod} of ${origObject} is already wrapped, not wrapping again.`);
    return;
  }

  shimmer.wrap(origObject, origMethod, function instanaShimmerWrap(originalFunction) {
    return function instanaShimmerWrapInner() {
      let originalCalled = false;
      const originalThis = this;
      const originalArgs = arguments;

      function instanaOriginalFunctionWrapper() {
        // NOTE: we keep this check for super safety. we are not aware of a use case atm.
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
