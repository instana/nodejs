/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const util = require('util');
const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
  hook.onFileLoad(/\/log4js\/lib\/logger\.js/, instrumentLog4jsLogger);
};

function instrumentLog4jsLogger(loggerModule) {
  shimmer.wrap(loggerModule.prototype, '_log', shimLog);
}

function shimLog(originalLog) {
  return function (level, data) {
    // The __instana attribute identifies the Instana logger, so prevent these logs from being traced.
    if (this.__instana) {
      return originalLog.apply(this, arguments);
    }

    if (cls.skipExitTracing({ isActive, skipAllowRootExitSpanPresence: true })) {
      return originalLog.apply(this, arguments);
    }

    if (level == null || typeof level.level !== 'number' || level.level < 30000) {
      return originalLog.apply(this, arguments);
    }

    return instrumentedLog(this, data, originalLog, level.level >= 40000, level);
  };
}

function instrumentedLog(ctx, data, originalLog, markAsError, level) {
  return cls.ns.runAndReturn(() => {
    let message;

    // _log receives data as an array of the message arguments (no level prefix).
    if (data.length === 1 && typeof data[0] === 'string') {
      message = data[0];
    } else {
      message = util.format(...data);
    }

    const span = cls.startSpan({
      spanName: 'log.log4js',
      kind: constants.EXIT
    });
    span.stack = tracingUtil.getStackTrace(instrumentedLog);
    span.data.log = {
      message
    };
    if (markAsError) {
      span.ec = 1;
    }

    try {
      return originalLog.apply(ctx, [level, data]);
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
