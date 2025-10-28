/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const { inspect } = require('util');
const shimmer = require('../../shimmer');
const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
  hook.onModuleLoad('pino', instrumentPinoTools);
};

function instrumentPinoTools(pinoModule) {
  const isESM = pinoModule[Symbol.toStringTag] === 'Module';
  const moduleExports = isESM ? pinoModule.default : pinoModule;

  function wrapLoggerMethods(loggerInstance, customLevels) {
    ['warn', 'error', 'fatal'].forEach(levelName => {
      shimmer.wrap(loggerInstance, levelName, shimGenLog(levelName));
    });

    if (customLevels) {
      Object.keys(customLevels).forEach(levelName => {
        const levelNum = customLevels[levelName];
        if (typeof levelNum === 'number' && levelNum >= 40) {
          shimmer.wrap(loggerInstance, levelName, shimGenLog(levelName));
        }
      });
    }
  }

  const patchedPino = Object.assign((...args) => {
    const logger = moduleExports(...args);
    const customLevels = args[0] && args[0].customLevels;

    wrapLoggerMethods(logger, customLevels);

    const originalChildFn = logger.child;
    logger.child = function child(...childArgs) {
      const childLogger = originalChildFn.apply(this, childArgs);
      wrapLoggerMethods(childLogger, customLevels);
      return childLogger;
    };

    return logger;
  }, moduleExports);

  if (typeof patchedPino.pino === 'function') {
    patchedPino.pino = patchedPino;
  }

  if (typeof patchedPino.default === 'function') {
    patchedPino.default = patchedPino;
  }

  if (isESM) {
    if (module.pino) {
      module.pino = patchedPino;
    }
    module.default = patchedPino;
  }
  return patchedPino;
}

function shimGenLog(level) {
  return function shimGenLogInner(originalGenLog) {
    return function instanaShimGenLog(mergingObject, message) {
      if (cls.skipExitTracing({ isActive, skipAllowRootExitSpanPresence: true })) {
        return originalGenLog.apply(this, arguments);
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
        span.stack = tracingUtil.getStackTrace(instanaShimGenLog);

        span.data.log = {
          message: formatMessage(mergingObject, message)
        };

        if (level !== 'warn') {
          span.ec = 1;
        }

        try {
          return originalGenLog.apply(ctx, originalArgs);
        } finally {
          span.d = Date.now() - span.ts;
          span.transmit();
        }
      });
    };
  };
}

function formatMessage(mergingObject, message) {
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

  return message;
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
