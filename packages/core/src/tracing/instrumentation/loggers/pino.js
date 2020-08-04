/* eslint-disable max-len */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
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
      const originalLoggingFunction = originalGenLog.apply(this, arguments);
      return function log(mergingObject, message) {
        if (isActive && cls.isTracing()) {
          const parentSpan = cls.getCurrentSpan();
          if (parentSpan && !constants.isExitSpan(parentSpan)) {
            const originalArgs = new Array(arguments.length);
            for (let i = 0; i < arguments.length; i++) {
              originalArgs[i] = arguments[i];
            }
            const ctx = this;
            return cls.ns.runAndReturn(() => {
              const span = cls.startSpan('log.pino', constants.EXIT);
              span.stack = tracingUtil.getStackTrace(log);
              if (typeof mergingObject === 'string') {
                message = mergingObject;
              } else if (mergingObject && typeof mergingObject.message === 'string' && typeof message === 'string') {
                message = `${mergingObject.message} -- ${message}`;
              } else if (mergingObject && typeof mergingObject.message === 'string') {
                message = mergingObject.message;
              } else if (typeof message !== 'string') {
                message =
                  'Log call without message. The Pino mergingObject argument will not be serialized by Instana for performance reasons.';
              }
              span.data.log = {
                message
              };
              if (level >= 50) {
                span.ec = 1;
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

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
