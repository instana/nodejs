'use strict';

var spanBuffer = require('./spanBuffer');
var tracingUtil = require('./tracingUtil');
var constants = require('./constants');
var hooked = require('./clsHooked');
var tracingMetrics = require('./metrics');
var logger;
logger = require('../logger').getLogger('tracing/cls', function(newLogger) {
  logger = newLogger;
});

var currentEntrySpanKey = (exports.currentEntrySpanKey = 'com.instana.entrySpan');
var currentSpanKey = (exports.currentSpanKey = 'com.instana.span');
var reducedSpanKey = (exports.reducedSpanKey = 'com.instana.reduced');

var tracingLevelKey = (exports.tracingLevelKey = 'com.instana.tl');
// eslint-disable-next-line no-undef-init
var serviceName = undefined;
var processIdentityProvider = null;

/*
 * Access the Instana namespace in context local storage.
 *
 * Usage:
 *   cls.ns.get(key);
 *   cls.ns.set(key);
 *   cls.ns.run(function() {});
 *
 */
exports.ns = hooked.createNamespace('instana.collector');

exports.init = function init(config, _processIdentityProvider) {
  if (config && config.serviceName) {
    serviceName = config.serviceName;
  }
  processIdentityProvider = _processIdentityProvider;
};

/*
 * Start a new span and set it as the current span.
 */
exports.startSpan = function startSpan(spanName, kind, traceId, parentSpanId, modifyAsyncContext) {
  tracingMetrics.incrementOpened();
  if (!kind || (kind !== constants.ENTRY && kind !== constants.EXIT && kind !== constants.INTERMEDIATE)) {
    logger.warn('Invalid span (%s) without kind/with invalid kind: %s, assuming EXIT.', spanName, kind);
    kind = constants.EXIT;
  }
  modifyAsyncContext = modifyAsyncContext !== false;
  var span = new InstanaSpan(spanName);
  var parentSpan = exports.ns.get(currentSpanKey);
  span.k = kind;

  // If specified, use params
  if (traceId && parentSpanId) {
    span.t = traceId;
    span.p = parentSpanId;
    // else use pre-existing context (if any)
  } else if (parentSpan) {
    span.t = parentSpan.t;
    span.p = parentSpan.s;
    // last resort, use newly generated Ids
  } else {
    span.t = tracingUtil.generateRandomTraceId();
  }
  span.s = tracingUtil.generateRandomSpanId();

  if (span.k === constants.ENTRY) {
    if (modifyAsyncContext) {
      // Make the entry span available independently (even if getCurrentSpan would return an intermediate or an exit at
      // any given moment). This is used in the error handlers of web frameworks like Express to attach path templates
      // and errors messages.
      span.addCleanup(exports.ns.set(currentEntrySpanKey, span));
    }
  }

  if (modifyAsyncContext) {
    span.addCleanup(exports.ns.set(currentSpanKey, span));
  }
  return span;
};

/*
 * Get the currently active entry span.
 */
exports.getCurrentEntrySpan = function getCurrentEntrySpan() {
  return exports.ns.get(currentEntrySpanKey);
};

/*
 * Set the currently active span.
 */
exports.setCurrentSpan = function setCurrentSpan(span) {
  exports.ns.set(currentSpanKey, span);
  return span;
};

/*
 * Get the currently active span.
 */
exports.getCurrentSpan = function getCurrentSpan() {
  return exports.ns.get(currentSpanKey);
};

/*
 * Get the reduced backup of the last active span in this cls context.
 */
exports.getReducedSpan = function getReducedSpan() {
  return exports.ns.get(reducedSpanKey);
};

/*
 * Determine if we're currently tracing or not.
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
 */
exports.tracingSuppressed = function tracingSuppressed() {
  var tl = exports.tracingLevel();
  return tl && tl === '0';
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
  this.n = name;
  this.k = undefined;
  if (processIdentityProvider && typeof processIdentityProvider.getFrom === 'function') {
    this.f = processIdentityProvider.getFrom();
  }
  this.async = false;
  this.error = false;
  this.ec = 0;
  this.ts = Date.now();
  this.d = 0;
  this.stack = [];
  this.data = serviceName != null ? { service: serviceName } : {};

  // properties used within the collector that should not be transmitted to the agent/backend
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
  Object.defineProperty(this, 'manualEndMode', {
    value: false,
    writable: true,
    enumerable: false
  });
}

InstanaSpan.prototype.addCleanup = function addCleanup(fn) {
  this.cleanupFunctions.push(fn);
};

InstanaSpan.prototype.transmit = function transmit() {
  if (!this.transmitted && !this.manualEndMode) {
    spanBuffer.addSpan(this);
    this.cleanup();
    tracingMetrics.incrementClosed();
    this.transmitted = true;
  }
};

InstanaSpan.prototype.transmitManual = function transmitManual() {
  if (!this.transmitted) {
    spanBuffer.addSpan(this);
    this.cleanup();
    tracingMetrics.incrementClosed();
    this.transmitted = true;
  }
};

InstanaSpan.prototype.cancel = function cancel() {
  if (!this.transmitted) {
    this.cleanup();
    tracingMetrics.incrementClosed();
    this.transmitted = true;
  }
};

InstanaSpan.prototype.cleanup = function cleanup() {
  this.cleanupFunctions.forEach(call);
  this.cleanupFunctions.length = 0;
};

InstanaSpan.prototype.disableAutoEnd = function disableAutoEnd() {
  this.manualEndMode = true;
};

InstanaSpan.prototype.resetData = function resetData() {
  this.data = this.data && this.data.service != null ? { service: this.data.service } : {};
};

function call(fn) {
  fn();
}
