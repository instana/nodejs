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

var currentEntrySpanKey = (exports.currentEntrySpanKey = 'com.instana.entry');
var currentSpanKey = (exports.currentSpanKey = 'com.instana.span');
var reducedSpanKey = (exports.reducedSpanKey = 'com.instana.reduced');
var tracingLevelKey = (exports.tracingLevelKey = 'com.instana.tl');
var w3cTraceContextKey = (exports.w3cTraceContextKey = 'com.instana.w3ctc');

// eslint-disable-next-line no-undef-init
var serviceName = undefined;
var processIdentityProvider = null;

/*
 * Access the Instana namespace in continuation local storage.
 *
 * Usage:
 *   cls.ns.get(key);
 *   cls.ns.set(key);
 *   cls.ns.run(function() {});
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
exports.startSpan = function startSpan(spanName, kind, traceId, parentSpanId, w3cTraceContext) {
  tracingMetrics.incrementOpened();
  if (!kind || (kind !== constants.ENTRY && kind !== constants.EXIT && kind !== constants.INTERMEDIATE)) {
    logger.warn('Invalid span (%s) without kind/with invalid kind: %s, assuming EXIT.', spanName, kind);
    kind = constants.EXIT;
  }
  var span = new InstanaSpan(spanName);
  span.k = kind;

  var parentSpan = exports.getCurrentSpan();
  var parentW3cTraceContext = exports.getW3cTraceContext();

  // If the client code has specified a trace ID/parent ID, use the provided IDs.
  if (traceId) {
    span.t = traceId;
    if (parentSpanId) {
      span.p = parentSpanId;
    }
  } else if (parentSpan) {
    // Otherwise, use the currently active span (if any) as parent.
    span.t = parentSpan.t;
    span.p = parentSpan.s;
  } else {
    // If no IDs have been provided, we start a new trace by generating a new trace ID. We do not set a parent ID in
    // this case.
    span.t = tracingUtil.generateRandomTraceId();
  }

  // Always generate a new span ID for the new span.
  span.s = tracingUtil.generateRandomSpanId();

  if (!w3cTraceContext && parentW3cTraceContext) {
    // If there is no incoming W3C trace context that has been read from HTTP headers, but there is a parent trace
    // context associated with a parent span, we will create an updated copy of that parent W3C trace context. We must
    // make sure that the parent trace context in the parent cls context is not modified.
    w3cTraceContext = parentW3cTraceContext.clone();
  }

  if (w3cTraceContext) {
    w3cTraceContext.updateParent(span.t, span.s);
    span.addCleanup(exports.ns.set(w3cTraceContextKey, w3cTraceContext));
  }

  if (span.k === constants.ENTRY) {
    // Make the entry span available independently (even if getCurrentSpan would return an intermediate or an exit at
    // any given moment). This is used by the instrumentations of web frameworks like Express.js to add path templates
    // and error messages to the entry span.
    span.addCleanup(exports.ns.set(currentEntrySpanKey, span));
  }

  // Set the span object as the currently active span in the active CLS context and also add a cleanup hook for when
  // this span is transmitted.
  span.addCleanup(exports.ns.set(currentSpanKey, span));
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
 * Stores the W3C trace context object.
 */
exports.setW3cTraceContext = function setW3cTraceContext(traceContext) {
  exports.ns.set(w3cTraceContextKey, traceContext);
};

/*
 * Returns the W3C trace context object.
 */
exports.getW3cTraceContext = function getW3cTraceContext() {
  return exports.ns.get(w3cTraceContextKey);
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
  return typeof tl === 'string' && tl.indexOf('0') === 0;
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
