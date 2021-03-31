/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const util = require('util');
const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

let levels;

exports.init = function init() {
  requireHook.onFileLoad(/\/log4js\/lib\/levels\.js/, saveLevelsRef);
  requireHook.onFileLoad(/\/log4js\/lib\/logger\.js/, instrumentLog4jsLogger);
};

function saveLevelsRef(levelsModule) {
  if (typeof levelsModule.getLevel === 'function' && levelsModule.INFO != null) {
    levels = levelsModule;
  }
}

function instrumentLog4jsLogger(loggerModule) {
  shimmer.wrap(loggerModule.prototype, 'log', shimLog);
}

function shimLog(originalLog) {
  return function (level) {
    if (!isActive || !cls.isTracing()) {
      return originalLog.apply(this, arguments);
    }

    const parentSpan = cls.getCurrentSpan();
    if (!parentSpan || constants.isExitSpan(parentSpan)) {
      return originalLog.apply(this, arguments);
    }

    const actualLevel = levels && levels.getLevel(level, levels.INFO);
    if (actualLevel == null || typeof actualLevel.level !== 'number' || actualLevel.level < 30000) {
      return originalLog.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    return instrumentedLog(this, originalArgs, originalLog, actualLevel.level >= 40000);
  };
}

function instrumentedLog(ctx, originalArgs, originalLog, markAsError) {
  return cls.ns.runAndReturn(() => {
    let message;

    // fast path for single string log call
    if (originalArgs.length === 2 && typeof originalArgs[1] === 'string') {
      message = originalArgs[1];
    } else {
      // The original log4js log method takes (level, ...data) as arguments and creates the actually logged message via
      // util.format(...data). The following is equivalent, but Node.js 4 compliant (spread syntax is available
      // beginning with Node.js 5).
      const messageArgs = originalArgs.slice(1);
      message = util.format.apply(util, messageArgs);
    }

    const span = cls.startSpan('log.log4js', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedLog);
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
