'use strict';

var stackTrace = require('../util/stackTrace');
var hooked = require('cls-hooked');
var log = require('../logger');

var logger = log.getLogger('cls');

var stackTraceLength = 0;
var simulatedUidCounter = 0;

var contextDefaults = {
  spanId: null,
  parentSpanId: null,
  traceId: null,
  suppressTracing: false,
  containsExitSpan: false
};

exports.init = function init(config) {
  stackTraceLength = config.tracing.stackTraceLength != null ? config.tracing.stackTraceLength : 10;
};

/*
 * Access the Instana namespace in context local storage.
 *
 * Usage:
 *   cls.stanStorage.get(key);
 *   cls.stanStorage.set(key);
 *   cls.stanStorage.run(function() {});
 *
 */
var instanaNamespace = 'instana.sensor';
Object.defineProperty(exports, 'stanStorage', {
  get: function() {
    return hooked.getNamespace(instanaNamespace) || hooked.createNamespace(instanaNamespace);
  }
});

/*
 * Access the Instana configuration hash.
 *
 * Usage:
 *   cls.config.suppressTracing;
 *
 */
var configKey = 'stanConfig';
Object.defineProperty(exports, 'config', {
  get: function() {
    return exports.stanStorage.get(configKey) || exports.stanStorage.set(configKey, {});
  }
});

/*
 * Create a new tracing context and inherit from the active context (if
 * there is one).
 *
 * @returns {Hash} Hash representing the tracing context.
 */
var activeContextKey = 'acKey';
exports.createContext = function createContext() {
  var namespace = exports.stanStorage;
  var parentContext = namespace.get(activeContextKey) || contextDefaults;
  var parentUid = parentContext && parentContext.parentUid;

  var uid = 'sim-' + simulatedUidCounter++;
  var context = {
    uid: uid,
    parentUid: parentUid,
    spanId: null,
    parentSpanId: parentContext.spanId || parentContext.parentSpanId,
    traceId: parentContext.traceId,
    suppressTracing: parentContext.suppressTracing,
    containsExitSpan: parentContext.containsExitSpan
  };

  // Save the created context.
  exports.stanStorage.run(function() {
    namespace.set(context.uid, context);
  });

  logger.debug('createContext created: %j', context);
  return context;
};

/*
 * Create a new context and set it as the active context.
 *
 */
exports.createAndSetActiveContext = function createAndSetActiveContext() {
  var context = exports.createContext();
  return exports.setActiveContext(context);
};

/*
 * Get the active context.
 *
 * @returns {Hash} Hash representing the tracing context.
 *
 */
exports.getActiveContext = function getActiveContext() {
  return exports.stanStorage.get(activeContextKey);
};

/*
 * Determine if we're currently tracing or not.
 *
 */
exports.isTracing = function isTracing() {
  return exports.stanStorage.get(activeContextKey) ? true : false;
};

/*
 * Set the active context.
 *
 * @returns {Hash} Hash representing the active tracing context.
 *
 */
exports.setActiveContext = function setActiveContext(activeContext) {
  logger.debug('setActiveContext: %j', activeContext);
  var namespace = exports.stanStorage;
  namespace.set(activeContext.uid, activeContext);
  namespace.set(activeContextKey, activeContext);

  setTimeout(exports.destroyContextByUid, 60000, activeContext.uid);
  return activeContext;
};

/*
 * Destroy a context by removing it from context local storage.  If this
 * context is also the active context, it will also be removed.
 *
 */
exports.destroyContextByUid = function destroyContextByUid(uid) {
  var acId = exports.stanStorage.get(activeContextKey);
  exports.stanStorage.run(function() {
    if (acId === uid) {
      exports.stanStorage.set(activeContextKey, null);
    }
    exports.stanStorage.set(uid, null);
  });
};

/*
 * Check if a context exists by Uid
 *
 */
exports.contextExistsByUid = function contextExistsByUid(uid) {
  var candidate = null;

  exports.stanStorage.run(function() {
    candidate = exports.stanStorage.get(uid);
  });

  return candidate ? true : false;
};

/*
 * Reset all context.
 *
 * Used in test suite to reset any/all context.
 *
 * @params: none
 * @return: none
 */
exports.reset = function reset() {
  logger.debug('Resetting CLS storage.');
  exports.stanStorage.set(activeContextKey, null);
};

/*
 * Capture a stack trace from the passed in function.
 *
 * @params {Function}
 */
exports.getStackTrace = function getStackTrace(referenceFunction) {
  return stackTrace.captureStackTrace(stackTraceLength, referenceFunction);
};
