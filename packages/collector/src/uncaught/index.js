'use strict';

var serializeError = require('serialize-error');

var logger;
logger = require('../logger').getLogger('util/uncaughtExceptionHandler', function(newLogger) {
  logger = newLogger;
});

var instanaNodeJsCore = require('@instana/core');
var tracing = instanaNodeJsCore.tracing;
var spanBuffer = tracing.spanBuffer;
var stackTraceUtil = instanaNodeJsCore.util.stackTrace;

var downstreamConnection = null;
var processIdentityProvider = null;
var uncaughtExceptionEventName = 'uncaughtException';
var unhandledRejectionEventName = 'unhandledRejection';
var unhandledRejectionDeprecationWarningHasBeenEmitted = false;
var stackTraceLength = 10;
var config;

// see
// https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode /
// https://github.com/nodejs/node/pull/26599
var unhandledRejectionsMode = 'warn/default';
for (var i = 0; i < process.execArgv.length; i++) {
  if (process.execArgv[i] === '--unhandled-rejections=none') {
    unhandledRejectionsMode = 'none';
  } else if (process.execArgv[i] === '--unhandled-rejections=strict') {
    unhandledRejectionsMode = 'strict';
  }
}

exports.init = function(_config, _downstreamConnection, _processIdentityProvider) {
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

exports.activate = function() {
  activateUncaughtExceptionHandling();
  activateUnhandledPromiseRejectionHandling();
};

function activateUncaughtExceptionHandling() {
  if (config.reportUncaughtException) {
    process.once(uncaughtExceptionEventName, onUncaughtException);
    try {
      if (require.resolve('netlinkwrapper')) {
        logger.info('Reporting uncaught exceptions is enabled.');
      } else {
        // This should actually not happen as require.resolve should either return a resolved filename or throw an
        // exception.
        logger.warn(
          'Reporting uncaught exceptions is enabled, but netlinkwrapper could not be loaded ' +
            "(require.resolve('netlinkwrapper') returned a falsy value). Uncaught exceptions will " +
            'not be reported to Instana for this application. This typically occurs when native addons could not be ' +
            'compiled during module installation (npm install/yarn). See the instructions to learn more about the ' +
            'requirements of the collector: ' +
            // eslint-disable-next-line max-len
            'https://github.com/instana/nodejs-sensor/blob/master/packages/collector/README.md#cpu-profiling-garbage-collection-and-event-loop-information'
        );
      }
    } catch (notResolved) {
      // This happens if netlinkwrapper is not available (it is an optional dependency).
      logger.warn(
        'Reporting uncaught exceptions is enabled, but netlinkwrapper could not be loaded. Uncaught exceptions will ' +
          'not be reported to Instana for this application. This typically occurs when native addons could not be ' +
          'compiled during module installation (npm install/yarn). See the instructions to learn more about the ' +
          'requirements of the collector: ' +
          // eslint-disable-next-line max-len
          'https://github.com/instana/nodejs-sensor/blob/master/packages/collector/https://github.com/instana/nodejs-sensor/blob/master/packages/collector/README.md#cpu-profiling-garbage-collection-and-event-loop-information'
      );
    }
  } else {
    logger.info('Reporting uncaught exceptions is disabled.');
  }
}

exports.deactivate = function() {
  process.removeListener(uncaughtExceptionEventName, onUncaughtException);
  process.removeListener(unhandledRejectionEventName, onUnhandledRejection);
};

function onUncaughtException(uncaughtError) {
  // because of the way Error.prepareStackTrace works and how error.stack is only created once and then cached it is
  // important to create the JSON formatted stack trace first, before anything else accesses error.stack.
  var jsonStackTrace = stackTraceUtil.getStackTraceAsJson(stackTraceLength, uncaughtError);
  finishCurrentSpanAndReportEvent(uncaughtError, jsonStackTrace);
  logAndRethrow(uncaughtError);
}

function finishCurrentSpanAndReportEvent(uncaughtError, jsonStackTrace) {
  var spans = finishCurrentSpan(jsonStackTrace);
  var eventPayload = createEventForUncaughtException(uncaughtError);
  downstreamConnection.reportUncaughtExceptionToAgentSync(eventPayload, spans);
}

function createEventForUncaughtException(uncaughtError) {
  return createEvent(uncaughtError, 'A Node.js process terminated abnormally due to an uncaught exception.', 10);
}

function finishCurrentSpan(jsonStackTrace) {
  var cls = tracing.getCls();
  if (!cls) {
    return [];
  }
  var currentSpan = cls.getCurrentSpan();
  if (!currentSpan) {
    return [];
  }

  currentSpan.error = true;
  currentSpan.ec = 1;
  currentSpan.d = Date.now() - currentSpan.ts;
  currentSpan.stack = jsonStackTrace;
  currentSpan.transmit();
  return spanBuffer.getAndResetSpans();
}

function logAndRethrow(err) {
  // Remove all listeners now, so the final throw err won't trigger other registered listeners a second time.
  var registeredListeners = process.listeners(uncaughtExceptionEventName);
  if (registeredListeners) {
    registeredListeners.forEach(function(listener) {
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

  downstreamConnection.sendEvent(createEventForUnhandledRejection(reason), function(error) {
    if (error) {
      logger.error('Error received while trying to send event to agent: %s', error.message);
    }
  });
}

function createEventForUnhandledRejection(reason) {
  return createEvent(reason, 'An unhandled promise rejection occured in a Node.js process.', 5);
}

function createEvent(error, title, severity) {
  var eventText = errorToMarkdown(error);
  return {
    title: title,
    text: eventText,
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    id:
      processIdentityProvider && typeof processIdentityProvider.getEntityId === 'function'
        ? processIdentityProvider.getEntityId()
        : undefined,
    timestamp: Date.now(),
    duration: 1,
    severity: severity
  };
}

function errorToMarkdown(error) {
  var serializedError = serializeError(error);
  if (serializedError.name && serializedError.message && typeof serializedError.stack === 'string') {
    // prettier-ignore
    return (
      '### ' + serializedError.name + '\n\n' +
      '#### Message: \n\n' + serializedError.message + '\n\n' +
      '#### Stack:\n\n' + stackTraceToMarkdown(serializedError.stack)
    );
  } else {
    return JSON.stringify(serializedError);
  }
}

function stackTraceToMarkdown(stackTrace) {
  var formatted = '';
  var callSites = stackTrace.split('\n');
  callSites.forEach(function(callSite) {
    formatted = formatted + '* `' + callSite.trim() + '`\n';
  });
  return formatted;
}
