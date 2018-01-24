'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var httpServer = require('./httpServer');
var cls = require('../cls');

var active = false;

exports.activate = function() {
  active = true;
};

exports.deactivate = function() {
  active = false;
};

exports.init = function() {
  requireHook.on('express', instrument);
};

function instrument(express) {
  if (express.Router && express.Router.handle && express.Router.use) { // express 4
    shimmer.wrap(express.Router, 'handle', shimExpress4Handle);
    shimmer.wrap(express.Router, 'use', shimExpress4Use);
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
    // An error handling middleware is defined as a middleware which accepts for parameters
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
  return function wrappedErrorHandlingFn(err, req, res, next) { // eslint-disable-line no-unused-vars
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

  span.data.http.error = getErrorDetails(err);
}

function getErrorDetails(err) {
  var message;
  if (typeof err === 'string') {
    message = err;
  } else {
    message = err.stack || err.message;
  }

  if (typeof message === 'string') {
    return message.slice(0, 500);
  }
  return undefined;
}
