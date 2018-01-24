'use strict';

var tracingUtil = require('./tracingUtil');
var hooked = require('cls-hooked');

var currentRootSpanKey = 'com.instana.rootSpan';
var currentSpanKey = 'com.instana.span';

var exitSpans = ['node.http.client', 'elasticsearch', 'mongo', 'mysql', 'redis'];
var entrySpans = ['node.http.server'];

/*
 * Access the Instana namespace in context local storage.
 *
 * Usage:
 *   cls.ns.get(key);
 *   cls.ns.set(key);
 *   cls.ns.run(function() {});
 *
 */
var instanaNamespace = 'instana.sensor';
Object.defineProperty(exports, 'ns', {
  get: function() {
    return hooked.getNamespace(instanaNamespace) || hooked.createNamespace(instanaNamespace);
  }
});

/*
 * Start a new span and set it as the current span
 *
 */
exports.startSpan = function startSpan(spanName, traceId, spanId) {
  var span = {
    f: tracingUtil.getFrom(),
    async: false,
    error: false,
    ec: 0,
    ts: Date.now(),
    d: 0,
    n: spanName,
    stack: [],
    data: null
  };

  var parentSpan = exports.ns.get(currentSpanKey);
  var randomId = tracingUtil.generateRandomSpanId();

  // If specified, use params
  if (traceId && spanId) {
    span.t = traceId;
    span.p = spanId;
  // else use pre-existing context (if any)
  } else if (parentSpan) {
    span.t = parentSpan.t;
    span.p = parentSpan.s;
  // last resort, use newly generated Ids
  } else {
    span.t = randomId;
  }
  span.s = randomId;

  // Set span direction type (1=entry, 2=exit, 3=local/intermediate)
  if (entrySpans.indexOf(span.n) > -1) {
    span.k = 1;
    exports.ns.set(currentRootSpanKey, span);
  } else if (exitSpans.indexOf(span.n) > -1) {
    span.k = 2;
  } else {
    span.k = 3;
  }

  exports.ns.set(currentSpanKey, span);
  return span;
};

/*
 * Get the currently active root span
 *
 */
exports.getCurrentRootSpan = function getCurrentRootSpan() {
  return exports.ns.get(currentRootSpanKey);
};

/*
 * Set the currently active span
 *
 */
exports.setCurrentSpan = function setCurrentSpan(span) {
  return exports.ns.set(currentSpanKey, span);
};

/*
 * Get the currently active span
 *
 */
exports.getCurrentSpan = function getCurrentSpan() {
  return exports.ns.get(currentSpanKey);
};

/*
 * Determine if we're currently tracing or not.
 *
 */
exports.isTracing = function isTracing() {
  return exports.ns.get(currentSpanKey) ? true : false;
};

/*
 * Set the tracing level
 */
var tracingLevelKey = 'tlKey';
exports.setTracingLevel = function setTracingLevel(level) {
  return exports.ns.set(tracingLevelKey, level);
};

/*
 * Get the tracing level (if any)
 */
exports.tracingLevel = function tracingLevel() {
  return exports.ns.get(tracingLevelKey);
};

/*
 * Determine if tracing is suppressed (via tracing level) for this request.
 *
 */
exports.tracingSuppressed = function tracingSuppressed() {
  var tl = exports.ns.get(tracingLevelKey);
  if (tl && tl === '0') {
    return true;
  }
  return false;
};

/*
 * Determine if <span> is an entry span
 *
 */
exports.isEntrySpan = function isEntrySpan(span) {
  return span.k === 1 ? true : false;
};

/*
 * Determine if <span> is an exit span
 *
 */
exports.isExitSpan = function isExitSpan(span) {
  return span.k === 2 ? true : false;
};

/*
 * Determine if <span> is an local span
 *
 */
exports.isLocalSpan = function isLocalSpan(span) {
  return span.k === 3 ? true : false;
};
