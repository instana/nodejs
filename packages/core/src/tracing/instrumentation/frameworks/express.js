/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const shimmer = require('shimmer');
const methods = require('methods');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const httpServer = require('../protocols/httpServer');
const cls = require('../../cls');

let active = false;

exports.activate = function activate() {
  active = true;
};

exports.deactivate = function deactivate() {
  active = false;
};

exports.init = function init() {
  requireHook.onModuleLoad('express', instrument);
};

function instrument(express) {
  if (express.Router && express.Router.handle && express.Router.use) {
    // express 4
    shimmer.wrap(express.Router, 'handle', shimExpress4Handle);
    shimmer.wrap(express.Router, 'use', shimExpress4Use);
  }

  if (express.Route && express.Route.prototype) {
    // express 4
    methods.concat('all').forEach(method => {
      if (typeof express.Route.prototype[method] === 'function') {
        shimmer.wrap(express.Route.prototype, method, shimHandlerRegistration);
      }
    });
  }
}

function shimExpress4Handle(realHandle) {
  return function shimmedHandle() {
    const args = [];
    for (let i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (typeof arg === 'function') {
        args.push(wrapExpress4HandleFn(arg));
      } else {
        args.push(arg);
      }
    }

    return realHandle.apply(this, args);
  };
}

function wrapExpress4HandleFn(fn) {
  return function wrappedHandleFn(err) {
    if (err && err.message && err.stack) {
      annotateHttpEntrySpanWithError(err);
    }
    return fn.apply(this, arguments);
  };
}

function shimExpress4Use(originalUse) {
  return function shimmedUsed(path, fn) {
    // CASE 1: error middleware with 4 parameters
    // CASE 2: any other middlware with 3 parameters and maybe early exit of incoming request
    if (typeof path === 'string' && typeof fn === 'function' && fn.length === 4) {
      const args = [];
      for (let i = 0; i < arguments.length; i++) {
        const arg = arguments[i];
        if (typeof arg === 'function') {
          args.push(wrapExpress4ErrorHandlingFn(arg));
        } else {
          args.push(arg);
        }
      }
      return originalUse.apply(this, args);
    } else if (typeof path === 'string' && typeof fn === 'function' && fn.length === 3) {
      const args = [];
      for (let i = 0; i < arguments.length; i++) {
        const arg = arguments[i];
        if (typeof arg === 'function') {
          args.push(wrapHandler(arg));
        } else {
          args.push(arg);
        }
      }
      return originalUse.apply(this, args);
    } else {
      return originalUse.apply(this, arguments);
    }
  };
}

function wrapExpress4ErrorHandlingFn(fn) {
  // Do not remove the unused parameters in the following line! Express.js uses the number of parameters on the function
  // to check whether this is an error handling function. Defining less than four parameter would change application
  // behavior.
  // eslint-disable-next-line no-unused-vars
  return function wrappedErrorHandlingFn(err, req, res, next) {
    annotateHttpEntrySpanWithError(err);
    return fn.apply(this, arguments);
  };
}

function annotateHttpEntrySpanWithError(err) {
  if (!err || !active) {
    return;
  }

  const span = cls.getCurrentEntrySpan();
  if (!span || span.n !== httpServer.spanName) {
    return;
  }

  span.data.http.error = tracingUtil.getErrorDetails(err);
}

function shimHandlerRegistration(original) {
  return function shimmedHandlerRegistration() {
    const args = [];
    for (let i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (typeof arg === 'function') {
        args.push(wrapHandler(arg));
      } else {
        args.push(arg);
      }
    }
    return original.apply(this, args);
  };
}

function wrapHandler(fn) {
  if (fn.length < 4) {
    // DO NOT REMOVE UNUSED PARAMETERS
    // express.js checks parameter count to decide what kind of handler function
    // it should invoke.
    // eslint-disable-next-line no-unused-vars
    return function wrappedInstanaMiddlewareHandlingFn(req, res, next) {
      annotateHttpEntrySpanWithPathTemplate(req);
      return fn.apply(this, arguments);
    };
  }

  // DO NOT REMOVE UNUSED PARAMETERS
  // express.js checks parameter count to decide what kind of handler function
  // it should invoke.
  // eslint-disable-next-line no-unused-vars
  return function wrappedInstanaErrorHandlingFn(err, req, res, next) {
    annotateHttpEntrySpanWithPathTemplate(req);
    return fn.apply(this, arguments);
  };
}

function annotateHttpEntrySpanWithPathTemplate(req) {
  const span = cls.getCurrentEntrySpan();

  if (!span || span.n !== httpServer.spanName || span.pathTplFrozen) {
    return;
  }

  let pathTpl;

  // CASE: Express attaches `req.route` when the target route get's dispatched
  //       `req.route` is not available when request is exited too early in a middleware
  if (!req.route) {
    pathTpl = req.originalUrl;
  } else {
    pathTpl = (req.baseUrl || '') + req.route.path;
  }

  /**
   * path_tpl = original url structure (parameterized such as /api/user/:id)
   *
   * If the registered path is not parameterized, we still send the `path_tpl`.
   * That means we provide the attribute for every request except for the following cases:
   *    - request is exited too early in a middleware
   *
   * And if we don't send path_tpl, backend will autogroup requests
   *
   *    e.g. /api/something/else -> /api
   */
  span.data.http.path_tpl = pathTpl;
}
