'use strict';

var transmission = require('./transmission');
var tracingUtil = require('./tracingUtil');
var hooked = require('./clsHooked');
var logger = require('../logger').getLogger('cls');

var currentRootSpanKey = (exports.currentRootSpanKey = 'com.instana.rootSpan');
var currentSpanKey = (exports.currentSpanKey = 'com.instana.span');
var tracingLevelKey = (exports.tracingLevelKey = 'com.instana.tl');

exports.ENTRY = 1;
exports.EXIT = 2;
exports.INTERMEDIATE = 3;

/*
 * Access the Instana namespace in context local storage.
 *
 * Usage:
 *   cls.ns.get(key);
 *   cls.ns.set(key);
 *   cls.ns.run(function() {});
 *
 */
exports.ns = hooked.createNamespace('instana.sensor');

/*
 * Start a new span and set it as the current span
 */
exports.startSpan = function startSpan(spanName, kind, traceId, spanId, modifyAsyncContext) {
  if (!kind || (kind !== exports.ENTRY && kind !== exports.EXIT && kind !== exports.INTERMEDIATE)) {
    logger.warn('Invalid span (%s) without kind/with invalid kind: %s, assuming EXIT.', spanName, kind);
    kind = exports.EXIT;
  }
  modifyAsyncContext = modifyAsyncContext !== false;
  var span = new InstanaSpan(spanName);
  var parentSpan = exports.ns.get(currentSpanKey);
  span.k = kind;

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
    span.t = tracingUtil.generateRandomTraceId();
  }
  span.s = tracingUtil.generateRandomSpanId();

  if (span.k === exports.ENTRY) {
    if (!span.p && modifyAsyncContext) {
      span.addCleanup(exports.ns.set(currentRootSpanKey, span));
    }
  }

  if (modifyAsyncContext) {
    span.addCleanup(exports.ns.set(currentSpanKey, span));
  }
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
  exports.ns.set(currentSpanKey, span);
  return span;
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
  return !!exports.ns.get(currentSpanKey);
};

/*
 * Set the tracing level
 */
exports.setTracingLevel = function setTracingLevel(level) {
  exports.ns.set(tracingLevelKey, level);
  return level;
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
  return span.k === 1;
};

/*
 * Determine if <span> is an exit span
 *
 */
exports.isExitSpan = function isExitSpan(span) {
  return span.k === 2;
};

/*
 * Determine if <span> is an local span
 *
 */
exports.isLocalSpan = function isLocalSpan(span) {
  return span.k === 3;
};

/*
 * Instead of creating a span object via {}, we use new InstanaSpan().
 * This will support better debugging, especially in cases where we need
 * to analyse heap dumps.
 *
 * Furthermore, it allows us to add CLS cleanup logic to the span and to
 * manipulate JSON serialization logic.
 */
function InstanaSpan(name) {
  // properties that part of our span model
  this.t = undefined;
  this.s = undefined;
  this.p = undefined;
  this.k = undefined;
  this.n = name;
  this.f = tracingUtil.getFrom();
  this.async = false;
  this.error = false;
  this.ec = 0;
  this.ts = Date.now();
  this.d = 0;
  this.stack = [];
  this.data = undefined;

  // properties used within the sensor that should not be transmitted to the agent/backend
  // NOTE: If you add a new property, make sure that it is not enumerable, as it may otherwise be transmitted
  // to the backend!
  Object.defineProperty(this, 'cleanupFunctions', {
    value: [],
    writable: false,
    enumerable: false
  });
  Object.defineProperty(this, 'transmitted', {
    value: false,
    writable: true,
    enumerable: false
  });
}

InstanaSpan.prototype.addCleanup = function addCleanup(fn) {
  this.cleanupFunctions.push(fn);
};

InstanaSpan.prototype.transmit = function transmit() {
  if (!this.transmitted) {
    transmission.addSpan(this);
    this.cleanup();
    this.transmitted = true;
  }
};

InstanaSpan.prototype.cancel = function cancel() {
  if (!this.transmitted) {
    this.cleanup();
    this.transmitted = true;
  }
};

InstanaSpan.prototype.cleanup = function cleanup() {
  this.cleanupFunctions.forEach(call);
  this.cleanupFunctions.length = 0;
};

function call(fn) {
  fn();
}
