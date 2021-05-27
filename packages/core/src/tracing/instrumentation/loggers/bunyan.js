/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
  requireHook.onModuleLoad('bunyan', instrument);
};

function instrument(Logger) {
  shimmer.wrap(Logger.prototype, 'warn', shimLog(false));
  shimmer.wrap(Logger.prototype, 'error', shimLog(true));
  shimmer.wrap(Logger.prototype, 'fatal', shimLog(true));
}

function shimLog(markAsError) {
  return originalLog =>
    function () {
      if (arguments.length === 0 || (this.fields && !!this.fields.__in)) {
        // * arguments.length === 0 -> This is a logger.warn() type of call (without arguments), this will not log
        // anything but simply return whether the log level in question is enabled for this logger.
        // * this.fields.__in -> This is one of Instana's own loggers, we never want to trace those log calls.
        return originalLog.apply(this, arguments);
      }
      if (isActive && cls.isTracing()) {
        const parentSpan = cls.getCurrentSpan();
        if (parentSpan && !constants.isExitSpan(parentSpan)) {
          const originalArgs = new Array(arguments.length);
          for (let i = 0; i < arguments.length; i++) {
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
}

function instrumentedLog(ctx, originalLog, originalArgs, markAsError) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('log.bunyan', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedLog);
    const fields = originalArgs[0];
    let message = originalArgs[1];
    if (typeof fields === 'string') {
      message = fields;
    } else if (fields && typeof fields.message === 'string' && typeof message === 'string') {
      message = `${fields.message} -- ${message}`;
    } else if (fields && typeof fields.message === 'string') {
      message = fields.message;
    } else if (
      fields &&
      fields.err &&
      typeof fields.err === 'object' &&
      typeof fields.err.message === 'string' &&
      typeof message === 'string'
    ) {
      // Support for fields.err.message based on the last example given in
      // https://github.com/trentm/node-bunyan#log-method-api - quote: "To pass in an Error *and* other fields, use the
      // `err` field name for the Error instance..."
      message = `${fields.err.message} -- ${message}`;
    } else if (fields && fields.err && typeof fields.err === 'object' && typeof fields.err.message === 'string') {
      message = fields.err.message;
    } else if (typeof message !== 'string') {
      message =
        'Log call without message. The Bunyan "fields" argument will not be serialized by Instana for performance reasons.';
    }
    span.data.log = {
      message
    };
    if (markAsError) {
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
