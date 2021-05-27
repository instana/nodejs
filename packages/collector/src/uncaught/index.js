/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const serializeError = require('serialize-error');

let logger;
logger = require('../logger').getLogger('util/uncaughtExceptionHandler', newLogger => {
  logger = newLogger;
});

const instanaNodeJsCore = require('@instana/core');
const tracing = instanaNodeJsCore.tracing;
const spanBuffer = tracing.spanBuffer;
const stackTraceUtil = instanaNodeJsCore.util.stackTrace;

let downstreamConnection = null;
let processIdentityProvider = null;
const uncaughtExceptionEventName = 'uncaughtException';
const unhandledRejectionEventName = 'unhandledRejection';
let unhandledRejectionDeprecationWarningHasBeenEmitted = false;
const stackTraceLength = 10;
let config;

// see
// https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode /
// https://github.com/nodejs/node/pull/26599
let unhandledRejectionsMode = 'warn/default';
for (let i = 0; i < process.execArgv.length; i++) {
  if (process.execArgv[i] === '--unhandled-rejections=none') {
    unhandledRejectionsMode = 'none';
  } else if (process.execArgv[i] === '--unhandled-rejections=strict') {
    unhandledRejectionsMode = 'strict';
  }
}

exports.init = function (_config, _downstreamConnection, _processIdentityProvider) {
  config = _config;
  downstreamConnection = _downstreamConnection;
  processIdentityProvider = _processIdentityProvider;
  if (config.reportUncaughtException) {
    if (!processIdentityProvider) {
      logger.warn('Reporting uncaught exceptions is enabled, but no process identity provider is available.');
    } else if (typeof processIdentityProvider.getEntityId !== 'function') {
      logger.warn(
        'Reporting uncaught exceptions is enabled, but the process identity provider does not support ' +
          'retrieving an entity ID.'
      );
    }
  }
};

exports.activate = function () {
  activateUncaughtExceptionHandling();
  activateUnhandledPromiseRejectionHandling();
};

function activateUncaughtExceptionHandling() {
  if (config.reportUncaughtException) {
    process.once(uncaughtExceptionEventName, onUncaughtException);
    logger.warn(
      'Reporting uncaught exceptions is enabled. This feature is deprecated. Please consider disabling it ' +
        'and rely on https://www.instana.com/docs/ecosystem/os-process/#abnormal-termination instead.'
    );
    if (process.version === 'v12.6.0') {
      logger.warn(
        'You are running Node.js v12.6.0 and have enabled reporting uncaught exceptions. To enable this feature, ' +
          '@instana/collector will register an uncaughtException handler. Due to a bug in Node.js v12.6.0, the ' +
          'original stack trace will get lost when this process is terminated with an uncaught exception. ' +
          'Instana recommends to use a different Node.js version (<= v12.5.0 or >= v12.6.1). See ' +
          'https://github.com/nodejs/node/issues/28550 for details.'
      );
    }
  } else {
    logger.info('Reporting uncaught exceptions is disabled.');
  }
}

exports.deactivate = function () {
  process.removeListener(uncaughtExceptionEventName, onUncaughtException);
  process.removeListener(unhandledRejectionEventName, onUnhandledRejection);
};

function onUncaughtException(uncaughtError) {
  // because of the way Error.prepareStackTrace works and how error.stack is only created once and then cached it is
  // important to create the JSON formatted stack trace first, before anything else accesses error.stack.
  const jsonStackTrace =
    uncaughtError != null ? stackTraceUtil.getStackTraceAsJson(stackTraceLength, uncaughtError) : null;
  finishCurrentSpanAndReportEvent(uncaughtError, jsonStackTrace);
  logAndRethrow(uncaughtError);
}

function finishCurrentSpanAndReportEvent(uncaughtError, jsonStackTrace) {
  const spans = finishCurrentSpan(jsonStackTrace);
  const eventPayload = createEventForUncaughtException(uncaughtError);
  downstreamConnection.reportUncaughtExceptionToAgentSync(eventPayload, spans);
}

function createEventForUncaughtException(uncaughtError) {
  return createEvent(uncaughtError, 'A Node.js process terminated abnormally due to an uncaught exception.', 10, false);
}

function finishCurrentSpan(jsonStackTrace) {
  const cls = tracing.getCls();
  if (!cls) {
    return [];
  }
  const currentSpan = cls.getCurrentSpan();
  if (!currentSpan) {
    return [];
  }

  currentSpan.ec = 1;
  currentSpan.d = Date.now() - currentSpan.ts;
  if (jsonStackTrace) {
    currentSpan.stack = jsonStackTrace;
  }
  currentSpan.transmit();
  return spanBuffer.getAndResetSpans();
}

function logAndRethrow(err) {
  // Remove all listeners now, so the final throw err won't trigger other registered listeners a second time.
  const registeredListeners = process.listeners(uncaughtExceptionEventName);
  if (registeredListeners) {
    registeredListeners.forEach(listener => {
      process.removeListener(uncaughtExceptionEventName, listener);
    });
  }
  // prettier-ignore
  // eslint-disable-next-line max-len
  logger.error('The Instana Node.js collector caught an otherwise uncaught exception to generate a respective Instana event for you. Instana will now rethrow the error to terminate this process, otherwise the application would be left in an inconsistent state, see https://nodejs.org/api/process.html#process_warning_using_uncaughtexception_correctly. The next line on stderr will look as if Instana crashed your application, but actually the original error came from your application code, not from Instana. Since we rethrow the original error, you should see its stacktrace below (depening on how you operate your application and how logging is configured.)');

  // Rethrow the original error (after notifying the agent) to trigger the process to finally terminate - Node won't
  // run this handler again since it (a) has been registered with `once` and (b) we removed all handlers for
  // uncaughtException anyway.
  throw err;
}

function activateUnhandledPromiseRejectionHandling() {
  if (config.reportUnhandledPromiseRejections) {
    if (unhandledRejectionsMode === 'strict') {
      logger.warn(
        'Node.js has been started with --unhandled-rejections=strict, therefore reporting unhandled promise ' +
          'rejections will not be enabled.'
      );
      return;
    }
    process.on(unhandledRejectionEventName, onUnhandledRejection);
    logger.info('Reporting unhandled promise rejections is enabled.');
  } else {
    logger.info('Reporting unhandled promise rejections is disabled.');
  }
}

function onUnhandledRejection(reason) {
  if (unhandledRejectionsMode !== 'none') {
    // Best effort to emit the same log messages that Node.js does by default (when no handler for the
    // unhandledRejection event is installed.
    // eslint-disable-next-line no-console
    console.warn('UnhandledPromiseRejectionWarning:', reason);
    // eslint-disable-next-line no-console
    console.warn(
      'UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing ' +
        'inside of an async function without a catch block, or by rejecting a promise which was not handled with ' +
        '.catch().'
    );
    if (!unhandledRejectionDeprecationWarningHasBeenEmitted) {
      // eslint-disable-next-line no-console
      console.warn(
        '[DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise ' +
          'rejections that are not handled will terminate the Node.js process with a non-zero exit code.'
      );
      unhandledRejectionDeprecationWarningHasBeenEmitted = true;
    }
  }

  downstreamConnection.sendEvent(createEventForUnhandledRejection(reason), error => {
    if (error) {
      logger.error('Error received while trying to send event to agent: %s', error.message);
    }
  });
}

function createEventForUnhandledRejection(reason) {
  return createEvent(reason, 'An unhandled promise rejection occured in a Node.js process.', 5, true);
}

function createEvent(error, title, severity, isPromiseRejection) {
  let eventText;
  if (error != null) {
    eventText = errorToMarkdown(error);
  } else if (isPromiseRejection) {
    eventText = 'No "reason" parameter has been provided when the promise was rejected.';
  } else {
    eventText = 'A null/undefined value has been thrown.';
  }
  return {
    title,
    text: eventText,
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    id:
      processIdentityProvider && typeof processIdentityProvider.getEntityId === 'function'
        ? processIdentityProvider.getEntityId()
        : undefined,
    timestamp: Date.now(),
    duration: 1,
    severity
  };
}

function errorToMarkdown(error) {
  /* eslint-disable max-len */
  const serializedError = serializeError(error);
  if (serializedError.name && serializedError.message && typeof serializedError.stack === 'string') {
    // prettier-ignore
    return `### ${serializedError.name}\n\n#### Message: \n\n${serializedError.message}\n\n#### Stack:\n\n${stackTraceToMarkdown(serializedError.stack)}`;
  } else {
    return JSON.stringify(serializedError);
  }
  /* eslint-enable max-len */
}

function stackTraceToMarkdown(stackTrace) {
  let formatted = '';
  const callSites = stackTrace.split('\n');
  callSites.forEach(callSite => {
    formatted = `${formatted}* \`${callSite.trim()}\`\n`;
  });
  return formatted;
}
