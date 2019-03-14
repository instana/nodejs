'use strict';

var constants = require('./constants');

/**
 * Provides very limited access from client code to the current active span.
 */
function SpanHandle(_span) {
  this.span = _span;
}

/**
 * Returns the trace ID of the span.
 */
SpanHandle.prototype.getTraceId = function getTraceId() {
  return this.span.t;
};

/**
 * Returns the span ID of the span.
 */
SpanHandle.prototype.getSpanId = function getSpanId() {
  return this.span.s;
};

/**
 * Returns the parent span ID of the span.
 */
SpanHandle.prototype.getParentSpanId = function getParentSpanId() {
  return this.span.p;
};

/**
 * Returns the name of the span.
 */
SpanHandle.prototype.getName = function getName() {
  return this.span.n;
};

/*
 * Determine if the span is an entry span (server span).
 */
SpanHandle.prototype.isEntrySpan = function isEntrySpan() {
  return constants.isEntrySpan(this.span);
};

/*
 * Determine if the span is an exit span (client span).
 */
SpanHandle.prototype.isExitSpan = function isExitSpan() {
  return constants.isExitSpan(this.span);
};

/*
 * Determine if the span is an intermediate span (local span).
 */
SpanHandle.prototype.isIntermediateSpan = function isIntermediateSpan() {
  return constants.isIntermediateSpan(this.span);
};

/**
 * Returns the timestamp of the span's start.
 */
SpanHandle.prototype.getTimestamp = function getTimestamp() {
  return this.span.ts;
};

/**
 * Returns the duration of the span. This method will return 0 if the span has not been completed yet.
 */
SpanHandle.prototype.getDuration = function getDuration() {
  return this.span.d;
};

/**
 * Returns the error count of the span. This method will usually return 0 if the span has not been completed yet.
 */
SpanHandle.prototype.getErrorCount = function getErrorCount() {
  return this.span.ec;
};

/**
 * Switches the span into manual-end-mode. Calls to span#transmit() as used by automatic tracing instrumentation will be
 * ignored. Instead, client code needs to finish the span (and trigger transmission) by calling spanHandle#end();
 */
SpanHandle.prototype.disableAutoEnd = function disableAutoEnd() {
  this.span.disableAutoEnd();
};

/**
 * Finishes as span that has been switched to manual-end-mode before.
 */
SpanHandle.prototype.end = function end(errorCount) {
  if (this.span.ts) {
    this.span.d = Date.now() - this.span.ts;
  }
  if (errorCount === true) {
    errorCount = 1;
  }
  if (typeof errorCount === 'number') {
    this.span.ec = errorCount;
  }
  this.span.transmitManual();
};

/**
 * Provides noop operation for the SpanHandle API when automatic tracing is not enabled or no span is currently active.
 */
function NoopSpanHandle() {}

NoopSpanHandle.prototype.getTraceId = function getTraceId() {
  return null;
};

NoopSpanHandle.prototype.getSpanId = function getSpanId() {
  return null;
};

NoopSpanHandle.prototype.getParentSpanId = function getParentSpanId() {
  return null;
};

NoopSpanHandle.prototype.getName = function getName() {
  return null;
};

NoopSpanHandle.prototype.isEntrySpan = function isEntrySpan() {
  return false;
};

NoopSpanHandle.prototype.isExitSpan = function isExitSpan() {
  return false;
};

NoopSpanHandle.prototype.isIntermediateSpan = function isIntermediateSpan() {
  return false;
};

NoopSpanHandle.prototype.getTimestamp = function getTimestamp() {
  return 0;
};

NoopSpanHandle.prototype.getDuration = function getDuration() {
  return 0;
};

NoopSpanHandle.prototype.getErrorCount = function getErrorCount() {
  return 0;
};

NoopSpanHandle.prototype.disableAutoEnd = function disableAutoEnd() {
  // provide dummy operation when automatic tracing is not enabled
};

NoopSpanHandle.prototype.end = function end() {
  // provide dummy operation when automatic tracing is not enabled
};

exports.getHandleForCurrentSpan = function getHandleForCurrentSpan(cls) {
  if (cls && cls.isTracing()) {
    return new SpanHandle(cls.getCurrentSpan());
  } else {
    return new NoopSpanHandle();
  }
};
