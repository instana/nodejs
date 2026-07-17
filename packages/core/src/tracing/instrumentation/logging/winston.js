/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');
const { LOG_LEVEL } = require('../../../util/constants');

let isActive = false;

const LEVEL_MAP = {
  // npm levels
  error: LOG_LEVEL.ERROR,
  warn: LOG_LEVEL.WARN,
  info: LOG_LEVEL.INFO,
  debug: LOG_LEVEL.DEBUG,
  verbose: LOG_LEVEL.TRACE,
  silly: LOG_LEVEL.TRACE,

  // RFC 5424 syslog levels
  emerg: LOG_LEVEL.FATAL,
  alert: LOG_LEVEL.FATAL,
  crit: LOG_LEVEL.ERROR,
  warning: LOG_LEVEL.WARN,
  notice: LOG_LEVEL.INFO
};

exports.init = function init() {
  // Winston 2.x
  hook.onFileLoad(/\/winston\/lib\/winston\/logger\.js/, instrumentWinston2);
  // Winston >= 3.x
  hook.onFileLoad(/\/winston\/lib\/winston\/create-logger\.js/, instrumentWinston3);
};

function instrumentWinston2(loggerModule) {
  if (typeof loggerModule.Logger !== 'function') {
    return loggerModule;
  }

  shimLogMethod(loggerModule.Logger.prototype);
  return loggerModule;
}

function instrumentWinston3(createLogger) {
  if (typeof createLogger !== 'function') {
    return createLogger;
  }

  // copy further exported properties
  Object.keys(createLogger).forEach(k => {
    instrumentedCreateLogger[k] = createLogger[k];
  });
  return instrumentedCreateLogger;

  function instrumentedCreateLogger() {
    const derivedLogger = createLogger.apply(this, arguments);

    // npm levels
    shimLevelMethod(derivedLogger, 'error', true);
    shimLevelMethod(derivedLogger, 'warn', false);
    shimLevelMethod(derivedLogger, 'info', false);

    // syslog levels (RFC5424)
    shimLevelMethod(derivedLogger, 'emerg', true);
    shimLevelMethod(derivedLogger, 'alert', true);
    shimLevelMethod(derivedLogger, 'crit', true);
    shimLevelMethod(derivedLogger, 'warning', false);
    shimLevelMethod(derivedLogger, 'notice', false);

    shimLogMethod(derivedLogger);
    return derivedLogger;
  }
}

function shimLevelMethod(derivedLogger, level, markAsError) {
  const originalMethod = derivedLogger[level];
  if (typeof originalMethod !== 'function') {
    return;
  }
  derivedLogger[level] = instrumentedLevelMethod(originalMethod, markAsError, level);
}

function instrumentedLevelMethod(originalMethod, markAsError, level) {
  return function (message) {
    // CASE: Customer is using a custom winston logger (instana.setLogger(winstonLogger)).
    //       We create a winston child logger for all instana internal logs.
    //       We should NOT trace these child logger logs. See collector/src/logger.js
    if (this.__instana) {
      return originalMethod.apply(this, arguments);
    }

    if (cls.skipExitTracing({ isActive, skipAllowRootExitSpanPresence: true })) {
      return originalMethod.apply(this, arguments);
    }

    if (!tracingUtil.shouldCaptureLogSpan(level)) {
      return originalMethod.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    if (
      arguments.length === 1 &&
      !!arguments[0] &&
      typeof arguments[0] === 'object' &&
      typeof arguments[0].message === 'string'
    ) {
      // this is the case logger.$level({ message: '...'})
      message = arguments[0].message;
    } else if (arguments.length >= 1) {
      for (let j = arguments.length - 1; j >= 1; j--) {
        if (!!arguments[j] && typeof arguments[j] === 'object' && typeof arguments[j].message === 'string') {
          message += arguments[j].message;
        }
      }
    }

    const ctx = this;
    return createSpan(ctx, originalMethod, originalArgs, message, markAsError);
  };
}

function shimLogMethod(derivedLogger) {
  const originalMethod = derivedLogger.log;
  if (typeof originalMethod !== 'function') {
    return;
  }
  derivedLogger.log = instrumentedLog(originalMethod);
}

function instrumentedLog(originalMethod) {
  return function (level, message) {
    if (arguments.length === 1 && typeof arguments[0] === 'string') {
      // this is actually level 'info'
      return originalMethod.apply(this, arguments);
    } else if (arguments.length === 1 && !!arguments[0] && typeof arguments[0] === 'object') {
      // this is the case logger.log({level: 'something', message: '...'})
      if (typeof arguments[0].level === 'string') {
        level = arguments[0].level;
      }
      if (typeof arguments[0].message === 'string') {
        message = arguments[0].message;
      }
    } else if (
      arguments.length === 2 &&
      !!arguments[1] &&
      typeof arguments[1] === 'object' &&
      typeof arguments[1].message === 'string'
    ) {
      message = arguments[1].message;
    } else if (arguments.length >= 2) {
      for (let i = arguments.length - 1; i >= 1; i--) {
        if (!!arguments[i] && typeof arguments[i] === 'object' && typeof arguments[i].message === 'string') {
          message += arguments[i].message;
        }
      }
    }

    if (cls.skipExitTracing({ isActive }) || !tracingUtil.shouldCaptureLogSpan(resolveLogLevel(level))) {
      return originalMethod.apply(this, arguments);
    }

    const originalArgs = new Array(arguments.length);
    for (let j = 0; j < arguments.length; j++) {
      originalArgs[j] = arguments[j];
    }
    const ctx = this;
    return createSpan(ctx, originalMethod, originalArgs, message, levelIsError(level));
  };
}

function resolveLogLevel(level) {
  return LEVEL_MAP[level];
}

function levelIsError(level) {
  const resolvedLevel = resolveLogLevel(level);
  return resolvedLevel === LOG_LEVEL.ERROR || resolvedLevel === LOG_LEVEL.FATAL;
}

function createSpan(ctx, originalMethod, originalArgs, message, markAsError) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: 'log.winston',
      kind: constants.EXIT
    });
    span.stack = tracingUtil.getStackTrace(createSpan);
    span.data.log = {
      message
    };
    if (markAsError) {
      span.ec = 1;
    }
    try {
      return originalMethod.apply(ctx, originalArgs);
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
