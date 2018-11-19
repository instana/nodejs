'use strict';

/**
 * Provides very limited access from client code to the current active span.
 */
function SpanHandle(_span) {
  this.span = _span;
}

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
 * Provides noop operation for the SpanHandle API when automatic tracing is not enabled.
 */
function NoopSpanHandle() {}

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
