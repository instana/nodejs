/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable max-len */

'use strict';

const shimmer = require('shimmer');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
  shimmer.wrap(console, 'warn', shimLog({ markAsError: false, level: 'warn' }));
  shimmer.wrap(console, 'error', shimLog({ markAsError: true, level: 'error' }));
};

// ATTENTION: Do not use console.warn or console.error in this file, otherwise it could run into endless loop
function shimLog(options) {
  return originalLog =>
    function () {
      if (arguments.length === 0) {
        // * arguments.length === 0 -> This is a console.warn() type of call (without arguments), this will not log
        // anything but simply return whether the log level in question is enabled for this logger.
        return originalLog.apply(this, arguments);
      }

      if (isActive && cls.isTracing()) {
        const parentSpan = cls.getCurrentSpan();

        if (parentSpan && !constants.isExitSpan(parentSpan)) {
          const originalArgs = new Array(arguments.length);

          for (let i = 0; i < arguments.length; i++) {
            originalArgs[i] = arguments[i];
          }

          instrumentedLog(this, originalLog, originalArgs, options);
        } else {
          return originalLog.apply(this, arguments);
        }
      } else {
        return originalLog.apply(this, arguments);
      }
    };
}

function instrumentedLog(ctx, originalLog, originalArgs, options) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('log.console', constants.EXIT);

    span.stack = tracingUtil.getStackTrace(instrumentedLog);
    const firstArg = originalArgs[0];
    let secondArg = originalArgs[1];

    if (typeof firstArg === 'string') {
      secondArg = firstArg;
    } else if (firstArg && typeof firstArg.message === 'string' && typeof secondArg === 'string') {
      // CASE: e.g. console.error(new Error('err msg'), 'Another message')
      secondArg = `${firstArg.message} -- ${secondArg}`;
    } else if (firstArg && typeof firstArg.message === 'string') {
      // CASE: e.g. console.error(new Error('err msg'))
      secondArg = firstArg.message;
    } else if (
      firstArg &&
      firstArg.err &&
      typeof firstArg.err === 'object' &&
      typeof firstArg.err.message === 'string' &&
      typeof secondArg === 'string'
    ) {
      // CASE: e.g. console.error({err: new Error(..)}, 'Another message')
      secondArg = `${firstArg.err.message} -- ${secondArg}`;
    } else if (
      firstArg &&
      firstArg.err &&
      typeof firstArg.err === 'object' &&
      typeof firstArg.err.message === 'string'
    ) {
      secondArg = firstArg.err.message;
    } else if (typeof secondArg !== 'string') {
      // CASE: e.g. console.error({x:y})
      secondArg = "Log call without message. Call won't be serialized by Instana for performance reasons.";
    }
    span.data.log = {
      message: secondArg,
      level: options.level
    };

    if (options.markAsError) {
      span.ec = 1;
    }

    try {
      return originalLog.apply(ctx, originalArgs);
    } finally {
      span.d = Date.now() - span.ts;
      span.transmit();
    }
  });
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
