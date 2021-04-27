/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const constants = require('./constants');

/**
 * Provides very limited access from client code to the current active span.
 * @param {import('./cls').InstanaBaseSpan} _span
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
 * @param {string} path
 * @param {*} value
 */
SpanHandle.prototype.annotate = function annotate(path, value) {
  if (path == null) {
    return;
  }
  if (typeof path === 'string') {
    _annotateWithString(this.span.data, path, value);
    if (path === 'http.path_tpl') {
      this.span.freezePathTemplate();
    }
  } else if (Array.isArray(path)) {
    _annotateWithArray(this.span.data, path, value);
    if (path[0] === 'http' && path[1] === 'path_tpl') {
      this.span.freezePathTemplate();
    }
  }
};

/**
 * @param {Object.<string, *>} target
 * @param {string} path
 * @param {*} value
 */
function _annotateWithString(target, path, value) {
  // remove trailing dots first
  if (path.charAt(path.length - 1) === '.') {
    _annotateWithString(target, path.substring(0, path.length - 1), value);
    return;
  }
  const idx = path.indexOf('.');
  if (idx === 0) {
    // key with leading "."
    _annotateWithString(target, path.substring(1), value);
  } else if (idx >= 1) {
    const head = path.substring(0, idx);
    const tail = path.substring(idx + 1);
    let nestedTarget = target[head];
    if (nestedTarget == null || typeof nestedTarget !== 'object') {
      target[head] = nestedTarget = {};
    }
    _annotateWithString(nestedTarget, tail, value);
  } else {
    target[path] = value;
  }
}

/**
 * @param {Object.<string, *>} target
 * @param {string} path
 * @param {*} value
 */
function _annotateWithArray(target, path, value) {
  if (path.length === 0) {
    // eslint-disable-next-line no-useless-return
    return;
  } else if (path.length === 1) {
    _annotateWithString(target, path[0], value);
  } else {
    const head = path[0];
    const tail = path.slice(1);
    let nestedTarget = target[head];
    if (nestedTarget == null || typeof nestedTarget !== 'object') {
      target[head] = nestedTarget = {};
    }
    _annotateWithArray(nestedTarget, tail, value);
  }
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
 * @param {boolean | number} errorCount
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
 * TODO: make it as a class
 * Provides noop operation for the SpanHandle API when automatic tracing is not enabled or no span is currently active.
 */
function NoopSpanHandle() {}

/**
 * @returns {null}
 */
NoopSpanHandle.prototype.getTraceId = function getTraceId() {
  return null;
};

/**
 * @returns {null}
 */
NoopSpanHandle.prototype.getSpanId = function getSpanId() {
  return null;
};

/**
 * @returns {null}
 */
NoopSpanHandle.prototype.getParentSpanId = function getParentSpanId() {
  return null;
};

/**
 * @returns {null}
 */
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

NoopSpanHandle.prototype.annotate = function annotate() {};

NoopSpanHandle.prototype.disableAutoEnd = function disableAutoEnd() {
  // provide dummy operation when automatic tracing is not enabled
};

NoopSpanHandle.prototype.end = function end() {
  // provide dummy operation when automatic tracing is not enabled
};

/**
 * @param {import ('./cls')} cls
 * @returns {SpanHandle | NoopSpanHandle}
 */
exports.getHandleForCurrentSpan = function getHandleForCurrentSpan(cls) {
  if (cls && cls.isTracing()) {
    return new SpanHandle(cls.getCurrentSpan());
  } else {
    return new NoopSpanHandle();
  }
};
