'use strict';

var serializeError = require('serialize-error');

var logger = require('../logger').getLogger('uncaughtExceptionHandler');
var transmission = require('../tracing/transmission');
var agentConnection = require('../agentConnection');
var stackTraceUtil = require('./stackTrace');
var pidStore = require('../pidStore');
var cls = require('../tracing/cls');

var uncaughtExceptionEventName = 'uncaughtException';
var stackTraceLength = 10;
var config;


exports.init = function(_config) {
  config = _config;
  setDefaults();
  if (config.tracing && config.tracing.stackTraceLength != null) {
    stackTraceLength = config.tracing.stackTraceLength;
  }
};


function setDefaults() {
  config.reportUncaughtException = config.reportUncaughtException === true;
}


exports.activate = function() {
  if (config.reportUncaughtException) {
    logger.info('Reporting uncaught exceptions is enabled.');
    process.once(uncaughtExceptionEventName, onUncaughtException);
  } else {
    logger.info('Reporting uncaught exceptions is disabled.');
  }
};


exports.deactivate = function() {
  process.removeListener(uncaughtExceptionEventName, onUncaughtException);
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
  agentConnection.reportUncaughtExceptionToAgentSync(eventPayload, spans);
}


function createEventForUncaughtException(uncaughtError) {
  var eventText = errorToMarkdown(uncaughtError);
  return {
    title: 'A Node.js process terminated abnormally due to an uncaught exception.',
    text: eventText,
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    id: pidStore.pid,
    timestamp: Date.now(),
    duration: 1,
    severity: 10
  };
}


function finishCurrentSpan(jsonStackTrace) {
  var currentSpan = cls.getCurrentSpan();
  if (!currentSpan) {
    return [];
  }
  currentSpan.error = true;
  currentSpan.ec = 1;
  currentSpan.d = Date.now() - currentSpan.ts;
  currentSpan.stack = jsonStackTrace;
  currentSpan.transmit();
  return transmission.getAndResetSpans();
}


function logAndRethrow(err) {
  // Remove all listeners now, so the final throw err won't trigger other registered listeners a second time.
  var registeredListeners = process.listeners(uncaughtExceptionEventName);
  if (registeredListeners) {
    registeredListeners.forEach(function(listener) {
      process.removeListener(uncaughtExceptionEventName, listener);
    });
  }
  // eslint-disable-next-line max-len
  logger.error('The Instana Node.js sensor caught an otherwise uncaught exception to generate a respective Instana event for you. Instana will now rethrow the error to terminate this process, otherwise the application would be left in an inconsistent state, see https://nodejs.org/api/process.html#process_warning_using_uncaughtexception_correctly. The next line on stderr will look as if Instana crashed your application, but actually the original error came from your application code, not from Instana. Since we rethrow the original error, you should see its stacktrace below (depening on how you operate your application and how logging is configured.)');

  // Rethrow the original error (after notifying the agent) to trigger the process to finally terminate - Node won't
  // run this handler again since it (a) has been registered with `once` and (b) we removed all handlers for
  // uncaughtException anyway.
  throw err;
}

function errorToMarkdown(error) {
  var serializedError = serializeError(error);
  if (serializedError.name && serializedError.message && typeof serializedError.stack === 'string') {
    return '### ' + serializedError.name + '\n\n' +
      '#### Message: \n\n' + serializedError.message + '\n\n' +
      '#### Stack:\n\n' + stackTraceToMarkdown(serializedError.stack);
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
