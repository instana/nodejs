'use strict';

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onFileLoad(/\/winston\/lib\/winston\/create-logger\.js/, instrumentCreateLogger);
};

function instrumentCreateLogger(createLogger) {
  if (typeof createLogger !== 'function') {
    return createLogger;
  }

  // copy further exported properties
  Object.keys(createLogger).forEach(function(k) {
    instrumentedCreateLogger[k] = createLogger[k];
  });
  return instrumentedCreateLogger;

  function instrumentedCreateLogger() {
    var derivedLogger = createLogger.apply(this, arguments);

    // npm levels
    shimLevelMethod(derivedLogger, 'error', true);
    shimLevelMethod(derivedLogger, 'warn', false);

    // syslog levels (RFC5424)
    shimLevelMethod(derivedLogger, 'emerg', true);
    shimLevelMethod(derivedLogger, 'alert', true);
    shimLevelMethod(derivedLogger, 'crit', true);
    shimLevelMethod(derivedLogger, 'error', true);
    shimLevelMethod(derivedLogger, 'warning', false);

    shimLogMethod(derivedLogger);
    return derivedLogger;
  }
}

function shimLevelMethod(derivedLogger, key, markAsError) {
  var originalMethod = derivedLogger[key];
  if (typeof originalMethod !== 'function') {
    return;
  }
  derivedLogger[key] = instrumentedLevelMethod(originalMethod, markAsError);
}

function instrumentedLevelMethod(originalMethod, markAsError) {
  return function(message) {
    if (isActive && cls.isTracing()) {
      var parentSpan = cls.getCurrentSpan();
      if (parentSpan && !cls.isExitSpan(parentSpan)) {
        var originalArgs = new Array(arguments.length);
        for (var i = 0; i < arguments.length; i++) {
          originalArgs[i] = arguments[i];
        }
        var ctx = this;
        return createSpan(ctx, originalMethod, originalArgs, message, markAsError);
      } else {
        return originalMethod.apply(this, arguments);
      }
    } else {
      return originalMethod.apply(this, arguments);
    }
  };
}

function shimLogMethod(derivedLogger) {
  var originalMethod = derivedLogger.log;
  if (typeof originalMethod !== 'function') {
    return;
  }
  derivedLogger.log = instrumentedLog(originalMethod);
}

function instrumentedLog(originalMethod) {
  return function(level, message) {
    if (arguments.length === 1) {
      // this is actually level 'info'
      return originalMethod.apply(this, arguments);
    }
    if (levelIsTraced(level) && isActive && cls.isTracing()) {
      var parentSpan = cls.getCurrentSpan();
      if (parentSpan && !cls.isExitSpan(parentSpan)) {
        var originalArgs = new Array(arguments.length);
        for (var i = 0; i < arguments.length; i++) {
          originalArgs[i] = arguments[i];
        }
        var ctx = this;
        return createSpan(ctx, originalMethod, originalArgs, message, levelIsError(level));
      } else {
        return originalMethod.apply(this, arguments);
      }
    } else {
      return originalMethod.apply(this, arguments);
    }
  };
}

function levelIsTraced(level) {
  return levelIsError(level) || level === 'warn' || level === 'warning';
}

function levelIsError(level) {
  return level === 'error' || level === 'emerg' || level === 'alert' || level === 'crit';
}

function createSpan(ctx, originalMethod, originalArgs, message, markAsError) {
  return cls.ns.runAndReturn(function() {
    var span = cls.startSpan('log.winston', cls.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedLevelMethod);
    span.data = {
      log: {
        message: message
      }
    };
    if (markAsError) {
      span.ec = 1;
      span.error = true;
    }
    try {
      return originalMethod.apply(ctx, originalArgs);
    } finally {
      span.d = Date.now() - span.ts;
      span.transmit();
    }
  });
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
