/* eslint-disable max-len */

'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onFileLoad(/\/pino\/lib\/tools\.js/, instrumentPinoTools);
};

function instrumentPinoTools(toolsModule) {
  shimmer.wrap(toolsModule, 'genLog', shimGenLog);
}

function shimGenLog(originalGenLog) {
  return function(level) {
    // pino uses numerical log levels, 40 is 'warn', level increases with severity.
    if (!level || level < 40) {
      // we are not interested in anything below warn
      return originalGenLog.apply(this, arguments);
    } else {
      var originalLoggingFunction = originalGenLog.apply(this, arguments);
      return function log(mergingObject, message) {
        if (isActive && cls.isTracing()) {
          var parentSpan = cls.getCurrentSpan();
          if (parentSpan && !cls.isExitSpan(parentSpan)) {
            var originalArgs = new Array(arguments.length);
            for (var i = 0; i < arguments.length; i++) {
              originalArgs[i] = arguments[i];
            }
            var ctx = this;
            return cls.ns.runAndReturn(function() {
              var span = cls.startSpan('log.pino', cls.EXIT);
              span.stack = tracingUtil.getStackTrace(log);
              if (typeof mergingObject === 'string') {
                message = mergingObject;
              } else if (mergingObject && typeof mergingObject.message === 'string' && typeof message === 'string') {
                message = mergingObject.message + ' -- ' + message;
              } else if (mergingObject && typeof mergingObject.message === 'string') {
                message = mergingObject.message;
              } else if (typeof message !== 'string') {
                message =
                  'Log call without message. The Pino mergingObject argument will not be serialized by Instana for performance reasons.';
              }
              span.data = {
                log: {
                  message: message
                }
              };
              if (level >= 50) {
                span.ec = 1;
                span.error = true;
              }
              try {
                return originalLoggingFunction.apply(ctx, originalArgs);
              } finally {
                span.d = Date.now() - span.ts;
                span.transmit();
              }
            });
          } else {
            return originalLoggingFunction.apply(this, arguments);
          }
        } else {
          return originalLoggingFunction.apply(this, arguments);
        }
      };
    }
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
