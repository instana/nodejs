'use strict';

var serializeError = require('serialize-error');
var async = require('async');

var logger = require('../logger').getLogger('uncaughtExceptionHandler');
var transmission = require('../tracing/transmission');
var agentConnection = require('../agentConnection');
var stackTraceUtil = require('./stackTrace');
var pidStore = require('../pidStore');
var cls = require('../tracing/cls');

var uncaughtExceptionEventName = 'uncaughtException';
var infoHasBeenLogged = false;
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
  config.reportUncaughtException = config.reportUncaughtException !== false;
}


exports.activate = function() {
  if (config.reportUncaughtException) {
    if (!infoHasBeenLogged) {
      logger.info('Reporting uncaught exceptions is enabled.');
      infoHasBeenLogged = true;
    }
    process.once(uncaughtExceptionEventName, onUncaughtException);
  } else if (!infoHasBeenLogged) {
    logger.info('Reporting uncaught exceptions is disabled.');
    infoHasBeenLogged = true;
  }
};


exports.deactivate = function() {
  process.removeListener(uncaughtExceptionEventName, onUncaughtException);
};


function onUncaughtException(uncaughtError) {
  // because of the way Error.prepareStackTrace works and how error.stack is only created once and then cached it is
  // important to create the JSON formatted stack trace first, before anything else accesses error.stack.
  var jsonStackTrace = stackTraceUtil.getStackTraceAsJson(stackTraceLength, uncaughtError);
  finishCurrentSpanAndReportEvent(uncaughtError, jsonStackTrace, logAndRethrow.bind(null, uncaughtError));
}


function finishCurrentSpanAndReportEvent(uncaughtError, jsonStackTrace, cb) {
  // If we can not finish our last minute actions after 1 second, it is probably better to let the process die
  // (and possibly get restarted) instead of waiting any longer. Thus we apply a 1000 ms timeout.
  async.timeout(async.parallel, 1000)([
      reportEvent.bind(null, uncaughtError),
      finishCurrentSpan.bind(null, jsonStackTrace),
    ],
    function() {
      // Ignore all errors from both last minute actions - if we can not report the event or finish the current span,
      // so be it.
      cb();
    });
}


function reportEvent(uncaughtError, cb) {
  var text = JSON.stringify(serializeError(uncaughtError));
  agentConnection.sendEventToAgent({
    title: 'A Node.js process terminated abnormally due to an uncaught exception.',
    text: text,
    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
    id: pidStore.pid,
    timestamp: Date.now(),
    duration: 1,
    severity: 10
  }, function(err) {
    if (err) {
      logger.warn('Failed to report uncaught exception event to agent.', {error: err});
    }
    cb();
  });
}


function finishCurrentSpan(jsonStackTrace, cb) {
  var currentSpan = cls.getCurrentSpan();
  if (!currentSpan) {
    return cb();
  }
  currentSpan.error = true;
  currentSpan.ec = 1;
  currentSpan.d = Date.now() - currentSpan.ts;
  currentSpan.stack = jsonStackTrace;
  currentSpan.transmit();
  transmission.transmitImmediately(function(err) {
    if (err) {
      logger.warn('Failed to transmit span for uncaught exception to agent.', {error: err});
    }
    cb();
  });
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
