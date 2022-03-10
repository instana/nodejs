/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const { inspect } = require('util');
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
  return function (level) {
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
                // calls like logger.error('only a message')
                message = mergingObject;
              } else if (mergingObject && typeof mergingObject.message === 'string' && typeof message === 'string') {
                // calls like
                // logger.error({ message: 'a message in the merging object'}, 'an additional  message as a string')
                message = `${mergingObject.message} -- ${message}`;
              } else if (mergingObject && typeof mergingObject.message === 'string') {
                // calls like
                // logger.error({ message: 'a message in the merging object'}) or
                // logger.error({ message: 'a message in the merging object: %s'}, /* non-string interpolation param */)
                message = mergingObject.message;
              } else if (typeof message === 'string') {
                // calls like
                // logger.error({ /* merging object without message attribute */ }, 'a string message)
                // Nothing to do, just use the given message (second argument) and ignore the first argument, which
                // apparently has no message attribute
              } else if (mergingObject != null) {
                // Fallback for calls with an unknown shape, like:
                // logger.error({ /* merging object without message attribute */ })
                // Serialize the first argument, but only the first level, and also shorten it:
                message = inspect(mergingObject, { depth: 1 }).substring(0, 500);
              } else {
                // If it is neither of those call patterns, we give up and do not capture a message.
                message = 'Pino log call without message and mergingObject.';
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
