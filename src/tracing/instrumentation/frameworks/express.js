'use strict';

var shimmer = require('shimmer');
var methods = require('methods');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var httpServer = require('../protocols/httpServer');
var cls = require('../../cls');

var active = false;

exports.activate = function() {
  active = true;
};

exports.deactivate = function() {
  active = false;
};

exports.init = function() {
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
    methods.concat('all').forEach(function(method) {
      if (typeof express.Route.prototype[method] === 'function') {
        shimmer.wrap(express.Route.prototype, method, shimHandlerRegistration);
      }
    });
  }
}

function shimExpress4Handle(realHandle) {
  return function shimmedHandle() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
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
      annotateHttpRootSpanWithError(err);
    }
    return fn.apply(this, arguments);
  };
}

function shimExpress4Use(originalUse) {
  return function shimmedUsed(path, fn) {
    // middleware attached to application.
    // An error handling middleware is defined as a middleware which accepts four parameters
    if (typeof path === 'string' && typeof fn === 'function' && fn.length === 4) {
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
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
  // DO NOT REMOVE THE UNUSED PARAMETERS IN THE FOLLOWING LINE
  // express is checking the existence for four parameters on the function to identify that this is an error
  // handling function. Defining less than four parameter would change application behavior.
  // eslint-disable-next-line no-unused-vars
  return function wrappedErrorHandlingFn(err, req, res, next) {
    annotateHttpRootSpanWithError(err);
    return fn.apply(this, arguments);
  };
}

function annotateHttpRootSpanWithError(err) {
  if (!err || !active) {
    return;
  }

  var span = cls.getCurrentRootSpan();
  if (!span || span.n !== httpServer.spanName) {
    return;
  }

  span.data.http.error = tracingUtil.getErrorDetails(err);
}

function shimHandlerRegistration(original) {
  return function shimmedHandlerRegistration() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
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
    return function(req, res, next) {
      annotateHttpEntrySpanWithPathTemplate(req);
      return fn.apply(this, arguments);
    };
  }

  // DO NOT REMOVE UNUSED PARAMETERS
  // express.js checks parameter count to decide what kind of handler function
  // it should invoke.
  // eslint-disable-next-line no-unused-vars
  return function(err, req, res, next) {
    annotateHttpEntrySpanWithPathTemplate(req);
    return fn.apply(this, arguments);
  };
}

function annotateHttpEntrySpanWithPathTemplate(req) {
  if (!req.route) {
    return;
  }

  var span = cls.getCurrentRootSpan();
  if (!span || span.n !== httpServer.spanName) {
    return;
  }

  span.data.http.path_tpl = (req.baseUrl || '') + req.route.path;
}
