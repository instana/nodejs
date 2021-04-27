/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const shimmer = require('shimmer');

/** @type {import('../../../logger').GenericLogger} */
let logger;
logger = require('../../../logger').getLogger('tracing/grpc', newLogger => {
  logger = newLogger;
});

const requireHook = require('../../../util/requireHook');
const cls = require('../../cls');

exports.init = function () {
  requireHook.onModuleLoad('superagent', exports.instrument);
};

// This instruments the Request object exported by superagent. The superagent library uses Node.js' http/https/http2
// modules under the hood and thus would not need custom instrumentation to capture HTTP exit spans. But: It's Request
// object is a custom thenable, and async_hooks currently does not propagate the async context for those (only for
// actual promise instances).
//
// Thus, when used with async/await – that is, using a pattern like
//     const response = superagent.get('http://example.com');
// we will have lost the async context in Request#then.
//
// To work around that issue, we attach the async context that is active when _creating_ the request and restore it in
// Request#then.
/**
 * @param {import('superagent')} superagent
 */
exports.instrument = function instrument(superagent) {
  // @ts-ignore
  const OriginalRequest = superagent.Request;
  if (!OriginalRequest || typeof OriginalRequest !== 'function') {
    logger.debug('Failed to instrument superagent. The provided object has no function named "Request".');
    return;
  }

  if (OriginalRequest.__in) {
    logger.debug('Attempted duplicated instrumentation of superagent. The provided object is already instrumented.');
    return;
  }

  // Instrument the superagent.Request constructor function to attach the async context to the request object.
  // @ts-ignore
  superagent.Request = function InstrumentedRequest() {
    const request = new (Function.prototype.bind.apply(
      OriginalRequest,
      [null].concat(Array.prototype.slice.call(arguments))
    ))();

    request.prototype = OriginalRequest.prototype;
    // attach async context to request object so it can be retrieved when request then is called.
    request.__inctx = cls.getAsyncContext();
    return request;
  };

  // @ts-ignore
  superagent.Request.__in = true;
  // @ts-ignore
  superagent.Request.prototype = OriginalRequest.prototype;

  // @ts-ignore
  shimmer.wrap(superagent.Request.prototype, 'then', instrumentThen);
};

/**
 * @param {*} originalThen
 */
function instrumentThen(originalThen) {
  return function instrumentedThen() {
    if (!this.__inctx) {
      return originalThen.apply(this, arguments);
    } else {
      const originalThis = this;
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return cls.runInAsyncContext(this.__inctx, () => originalThen.apply(originalThis, originalArgs));
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
