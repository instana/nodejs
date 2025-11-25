/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const shimmer = require('../../shimmer');
const methods = require('methods');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const httpServer = require('../protocols/httpServer');
const cls = require('../../cls');

let active = false;

const technology = 'http';

exports.activate = function activate() {
  active = true;
};

exports.deactivate = function deactivate() {
  active = false;
};

exports.init = function init() {
  hook.onModuleLoad('express', instrument);
};

function instrument(express) {
  // capture the uncaught error
  if (express.Router && express.Router.handle && express.Router.use) {
    // express 4
    shimmer.wrap(express.Router, 'handle', shimExpressHandle);
    shimmer.wrap(express.Router, 'use', shimExpress4Use);
  } else if (express.Router && express.Router.prototype) {
    // express v5
    shimmer.wrap(express.Router.prototype, 'handle', shimExpressHandle);
    shimmer.wrap(express.Router.prototype, 'use', shimExpress4Use);
  }

  if (express.Route && express.Route.prototype) {
    // express v4, v5
    // capture the path template
    methods.concat('all').forEach(method => {
      if (typeof express.Route.prototype[method] === 'function') {
        shimmer.wrap(express.Route.prototype, method, shimHandlerRegistration);
      }
    });
  }
}

function shimExpressHandle(realHandle) {
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
    // middleware attached to application.
    // An error handling middleware is defined as a middleware which accepts four parameters
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
    }
    return originalUse.apply(this, arguments);
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

  const errorDetails = tracingUtil.getErrorDetails(err);
  span.data[technology].error = errorDetails;
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
    return function (req, res, next) {
      annotateHttpEntrySpanWithPathTemplate(req);
      return fn.apply(this, arguments);
    };
  }

  // DO NOT REMOVE UNUSED PARAMETERS
  // express.js checks parameter count to decide what kind of handler function
  // it should invoke.
  // eslint-disable-next-line no-unused-vars
  return function (err, req, res, next) {
    annotateHttpEntrySpanWithPathTemplate(req);
    return fn.apply(this, arguments);
  };
}

function annotateHttpEntrySpanWithPathTemplate(req) {
  if (!req.route) {
    return;
  }

  const span = cls.getCurrentEntrySpan();
  if (!span || span.n !== httpServer.spanName || span.pathTplFrozen) {
    return;
  }

  span.data.http.path_tpl = (req.baseUrl || '') + req.route.path;
}
