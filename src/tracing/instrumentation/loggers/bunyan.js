/* eslint-disable max-len */

'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('bunyan', instrument);
};

function instrument(Logger) {
  shimmer.wrap(Logger.prototype, 'warn', shimLog(false));
  shimmer.wrap(Logger.prototype, 'error', shimLog(true));
  shimmer.wrap(Logger.prototype, 'fatal', shimLog(true));
}

function shimLog(markAsError) {
  return function(originalLog) {
    return function() {
      if (arguments.length === 0 || (this.fields && !!this.fields.__in)) {
        // * arguments.length === 0 -> This is a logger.warn() type of call (without arguments), this will not log
        // anything but simply return whether the log level in question is enabled for this logger.
        // * this.fields.__in -> This is one of Instana's own loggers, we never want to trace those log calls.
        return originalLog.apply(this, arguments);
      }
      if (isActive && cls.isTracing()) {
        var parentSpan = cls.getCurrentSpan();
        if (parentSpan && !cls.isExitSpan(parentSpan)) {
          var originalArgs = new Array(arguments.length);
          for (var i = 0; i < arguments.length; i++) {
            originalArgs[i] = arguments[i];
          }
          instrumentedLog(this, originalLog, originalArgs, markAsError);
        } else {
          return originalLog.apply(this, arguments);
        }
      } else {
        return originalLog.apply(this, arguments);
      }
    };
  };
}

function instrumentedLog(ctx, originalLog, originalArgs, markAsError) {
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('log.bunyan', cls.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedLog);
    var fields = originalArgs[0];
    var message = originalArgs[1];
    if (typeof fields === 'string') {
      message = fields;
    } else if (fields && typeof fields.message === 'string' && typeof message === 'string') {
      message = fields.message + ' -- ' + message;
    } else if (fields && typeof fields.message === 'string') {
      message = fields.message;
    } else if (typeof message !== 'string') {
      message =
        'Log call without message. The Bunyan "fields" argument will not be serialized by Instana for performance reasons.';
    }
    span.data = {
      log: {
        message: message
      }
    };
    if (markAsError) {
      span.ec = 1;
      span.error = true;
    }
    try {
      return originalLog.apply(ctx, originalArgs);
    } finally {
      span.d = Date.now() - span.ts;
      span.transmit();
    }
  });
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
