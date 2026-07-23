/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const { inspect } = require('util');
const shimmer = require('../../shimmer');

const { LOG_LEVEL_PRIORITY, LOG_LEVEL } = require('../../../util/constants');
const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

// Reverse the log level mapping once for numeric-to-name lookups.
// pino uses numerical log levels (for example, 30 -> "info").
const LEVEL_NAMES = Object.fromEntries(Object.entries(LOG_LEVEL_PRIORITY).map(([name, value]) => [value, name]));

exports.init = function init() {
  // TODO: Fix the issue with Pino instrumentation. If Pino is required multiple times,
  //       only the first instance gets instrumented. This behavior is caused by `onFileLoad`.
  //       Fix is being tracked in https://jsw.ibm.com/browse/INSTA-23066.
  hook.onFileLoad(/\/pino\/lib\/tools\.js/, instrumentPinoTools);
};

function instrumentPinoTools(toolsModule) {
  shimmer.wrap(toolsModule, 'genLog', shimGenLog);
}

function shimGenLog(originalGenLog) {
  return function (level) {
    const levelName = resolveLogLevel(level);

    if (!levelName || !tracingUtil.shouldCaptureLogSpan(levelName)) {
      return originalGenLog.apply(this, arguments);
    } else {
      const originalLoggingFunction = originalGenLog.apply(this, arguments);

      return function log(mergingObject, message) {
        if (cls.skipExitTracing({ isActive, skipAllowRootExitSpanPresence: true })) {
          return originalLoggingFunction.apply(this, arguments);
        }

        const originalArgs = new Array(arguments.length);

        for (let i = 0; i < arguments.length; i++) {
          originalArgs[i] = arguments[i];
        }

        const ctx = this;
        return cls.ns.runAndReturn(() => {
          const span = cls.startSpan({
            spanName: 'log.pino',
            kind: constants.EXIT
          });
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

          if (levelName === LOG_LEVEL.ERROR || levelName === LOG_LEVEL.FATAL) {
            span.ec = 1;
          }

          try {
            return originalLoggingFunction.apply(ctx, originalArgs);
          } finally {
            span.d = Date.now() - span.ts;
            span.transmit();
          }
        });
      };
    }
  };
}

function resolveLogLevel(level) {
  // `captureLogLevel` only accepts the standard log level names. Round custom
  // Pino numeric levels (e.g. 35, 55) down to the nearest standard level.
  const rounded = Math.floor(level / 10) * 10;
  return LEVEL_NAMES[rounded];
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
