/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
  hook.onModuleLoad('bunyan', instrument);
};

function instrument(Logger) {
  shimmer.wrap(Logger.prototype, 'warn', shimLog(false));
  shimmer.wrap(Logger.prototype, 'error', shimLog(true));
  shimmer.wrap(Logger.prototype, 'fatal', shimLog(true));
}

function shimLog(markAsError) {
  return originalLog =>
    function () {
      // CASE: Customer is using a custom bunyan logger (instana.setLogger(bunyanLogger)).
      //       We create a bunyan child logger for all instana internal logs.
      //       We should NOT trace these child logger logs. See collector/src/logger.js
      if (this.__instana) {
        return originalLog.apply(this, arguments);
      }

      if (arguments.length === 0) {
        // * arguments.length === 0 -> This is a logger.warn() type of call (without arguments), this will not log
        // anything but simply return whether the log level in question is enabled for this logger.
        return originalLog.apply(this, arguments);
      }

      if (cls.skipExitTracing({ isActive, skipAllowRootExitSpanPresence: true })) {
        return originalLog.apply(this, arguments);
      }

      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      instrumentedLog(this, originalLog, originalArgs, markAsError);
    };
}

function instrumentedLog(ctx, originalLog, originalArgs, markAsError) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: 'log.bunyan',
      kind: constants.EXIT
    });
    span.stack = tracingUtil.getStackTrace(instrumentedLog);
    const fields = originalArgs[0];
    let message = originalArgs[1];
    const maxStrLength = 500;

    if (typeof fields === 'string') {
      message = fields;
    } else if (fields instanceof Error && typeof message === 'string') {
      // CASE: logger.error(new Error('msg'), 'another msg')
      const errorMessage = tracingUtil.extractErrorMessage(fields);
      message = `${errorMessage} -- ${message}`;
    } else if (fields instanceof Error) {
      // CASE: logger.error(new Error('msg'))
      message = tracingUtil.extractErrorMessage(fields);
    } else if (fields?.err instanceof Error && typeof message === 'string') {
      // CASE: logger.error({ err: new Error(..) }, 'another msg')
      const errorMessage = tracingUtil.extractErrorMessage(fields.err);
      message = `${errorMessage} -- ${message}`;
    } else if (fields?.err instanceof Error) {
      // CASE: logger.error({ err: new Error(..) })
      message = tracingUtil.extractErrorMessage(fields.err);
    } else if (fields?.err && typeof fields.err.message === 'string' && typeof message === 'string') {
      // CASE: logger.error({ err: { message: 'msg' } }, 'another msg')
      message = `${fields.err.message} -- ${message}`;
    } else if (fields?.err && typeof fields.err.message === 'string') {
      // CASE: logger.error({ err: { message: 'msg' } })
      message = fields.err.message;
    } else if (fields && typeof fields.message === 'string' && typeof message === 'string') {
      message = `${fields.message} -- ${message}`;
    } else if (fields && typeof fields.message === 'string') {
      message = fields.message;
    } else if (typeof fields === 'object') {
      // CASE: we try our best to serialize logged objects
      //       we do not want to directly call JSON.stringify because we do not know how big the object is and
      //       there might be possible circular dependencies in the object.
      const maxNoOfKeys = 100;
      const obj = {};

      Object.keys(fields).every((key, index) => {
        // CASE: stop iteration if we have enough keys
        if (index > maxNoOfKeys) {
          return false;
        }

        const val = fields[key];
        if (typeof val === 'object') {
          obj[key] = '[Object]';
        } else {
          obj[key] = val;
        }

        return true;
      });

      if (message && typeof message === 'string') {
        message = `${JSON.stringify(obj)} - ${message}`;
      } else {
        message = JSON.stringify(obj);
      }
    } else {
      message =
        'Log call without message. The Bunyan "fields" argument cannot be serialized by Instana because of unknown format.';
    }

    if (message.length > maxStrLength) {
      message = `${message.substring(0, maxStrLength - 3)}...`;
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
