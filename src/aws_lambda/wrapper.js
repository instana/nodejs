'use strict';

const acceptorConnector = require('../util/acceptor_connector');
const logger = require('../util/logger');

/**
 * Wraps an AWS Lambda handler so that metrics and traces are reported to Instana. This function will figure out if the
 * Lambda handler uses the callback style or promise/async function style by inspecting the number of function arguments
 * the function receives.
 *
 * You can also choose the wrapping explicitly by using `instana.awsLambda.wrapWithCallback` or
 * `instana.awsLambda.wrapPromise`/`instana.awsLambda.wrapAsync` directly, but there is usually no need to do so.
 */
exports.wrap = function wrap(originalHandler) {
  switch (originalHandler.length) {
    case 2:
      return exports.wrapPromise(originalHandler);
    case 3:
      return exports.wrapWithCallback(originalHandler);
    default:
      logger.error(
        'Unexpected number of arguments, please use instana.wrapPromise/instana.wrapAsync or ' +
          'instana.wrapWithCallback explicitly.'
      );
      return originalHandler;
  }
};

/**
 * Wraps a callback-style AWS Lambda handler so that metrics and traces are reported to Instana.
 *
 * There is usually no need to call this directly, instead, use `instana.awsLambda.wrap`.
 */
exports.wrapWithCallback = function wrapWithCallback(originalHandler) {
  logger.debug('creating wrapper');
  return function(event, context, lambdaCallback) {
    const callbackWrapper = function(originalError, originalResult) {
      logger.debug('original callback finished');
      postHandler(() => {
        lambdaCallback(originalError, originalResult);
      });
    };

    originalHandler.call(null, event, context, callbackWrapper);
  };
};

/**
 * Wraps a promise style AWS Lambda handler so that metrics and traces are reported to Instana. This function can also
 * be used for async functions because they create an implicit promise.
 *
 * There is usually no need to call this directly, instead, use `instana.awsLambda.wrap`.
 */
exports.wrapPromise = function wrapPromise(originalHandler) {
  logger.debug('creating wrapper');
  return function(event, context) {
    const originalPromise = originalHandler(event, context);
    if (originalPromise == null) {
      return Promise.reject(
        new Error(
          'The wrapped function should have returned a promise/thenable, but it returned nothing (null or undefined).'
        )
      );
    } else if (!originalPromise.then) {
      return Promise.reject(
        new Error(
          'The wrapped function should have returned a promise/thenable, but the returned value does not have a then ' +
            'property.'
        )
      );
    } else if (typeof originalPromise.then !== 'function') {
      return Promise.reject(
        new Error(
          "The wrapped function should have returned a promise/thenable, but the returned value's then property is not " +
            'a function.'
        )
      );
    }
    // Promise.prototype.finally would be the right thing to do here instead of two separate handlers for the success
    // and error case, but it is not available, neither in 6.10 nor in 8.10. It only became available as of Node.js 10.0.0.
    return originalPromise.then(postPromise.bind(null, context, false), postPromise.bind(null, context, true));
  };
};

/**
 * An alias for `instana.awsLambda.wrapPromise`. Wraps a promise style or async function AWS Lambda handler so that
 * metrics and traces are reported to Instana. (Async functions create an implicit promise, so from the perspective of
 * thispackage promise based handlers and async function handlers are equivalenequivalent
 *
 * There is usually no need to call this directly, instead, use `instana.awsLambda.wrap`.
 */
exports.wrapAsync = exports.wrapPromise;

/**
 * Code to be executed after the promise returned by the original handler has completed.
 */
function postPromise(context, isError, value) {
  logger.debug('original promise finished');
  return new Promise((resolve, reject) => {
    postHandler(() => {
      if (isError) {
        reject(value);
      } else {
        resolve(value);
      }
    });
  });
}

function postHandler(callback) {
  acceptorConnector.sendBundle(err => {
    if (err) {
      // We intentionally do not propagate the error from the acceptor request - the customer's lambda needs to finish
      // successfully, no matter if we have been able to report metrics and spans.
      logger.warn('Could not send data to acceptor.', err.message);
      logger.debug('Could not send data to acceptor.', err);
    } else {
      logger.debug('Data has been sent to acceptor.');
    }
    callback();
  });

  // For shits and giggles, we could also send metrics and spans separately:
  // acceptorConnector.sendMetrics(err => {
  //   if (err) {
  //     // We intentionally do not propagate the error from the acceptor request - the customer's lambda needs to finish
  //     // successfully, no matter if we have been able to report metrics and spans.
  //     logger.warn('Could not send metrics to acceptor.', err.message);
  //     logger.debug('Could not send metrics to acceptor.', err);
  //   } else {
  //     logger.debug('Metrics have been sent to acceptor.');
  //   }
  //   acceptorConnector.sendSpans(err => {
  //     if (err) {
  //       // We intentionally do not propagate the error from the acceptor request - the customer's lambda needs to finish
  //       // successfully, no matter if we have been able to report metrics and spans.
  //       logger.warn('Could not send spans to acceptor.', err.message);
  //       logger.debug('Could not send spans to acceptor.', err);
  //     } else {
  //       logger.debug('Spans have been sent to acceptor.');
  //     }
  //     callback();
  //   });
  // });
}
