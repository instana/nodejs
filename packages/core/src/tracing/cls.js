/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const spanBuffer = require('./spanBuffer');
const tracingUtil = require('./tracingUtil');
const { ENTRY, EXIT, INTERMEDIATE } = require('./constants');
const hooked = require('./clsHooked');
const tracingMetrics = require('./metrics');
let logger;
logger = require('../logger').getLogger('tracing/cls', newLogger => {
  logger = newLogger;
});

const currentEntrySpanKey = (exports.currentEntrySpanKey = 'com.instana.entry');
const currentSpanKey = (exports.currentSpanKey = 'com.instana.span');
const reducedSpanKey = (exports.reducedSpanKey = 'com.instana.reduced');
const tracingLevelKey = (exports.tracingLevelKey = 'com.instana.tl');
const w3cTraceContextKey = (exports.w3cTraceContextKey = 'com.instana.w3ctc');

// eslint-disable-next-line no-undef-init
let serviceName = undefined;
let processIdentityProvider = null;

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

class InstanaSpan {
  constructor(name) {
    // properties that part of our span model
    this.t = undefined;
    this.s = undefined;
    this.p = undefined;
    this.n = name;
    this.k = undefined;
    if (processIdentityProvider && typeof processIdentityProvider.getFrom === 'function') {
      this.f = processIdentityProvider.getFrom();
    }
    this.ec = 0;
    this.ts = Date.now();
    this.d = 0;
    this.stack = [];
    this.data = {};

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
    Object.defineProperty(this, 'pathTplFrozen', {
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

  addCleanup(fn) {
    this.cleanupFunctions.push(fn);
  }

  transmit() {
    if (!this.transmitted && !this.manualEndMode) {
      spanBuffer.addSpan(this);
      this.cleanup();
      tracingMetrics.incrementClosed();
      this.transmitted = true;
    }
  }

  transmitManual() {
    if (!this.transmitted) {
      spanBuffer.addSpan(this);
      this.cleanup();
      tracingMetrics.incrementClosed();
      this.transmitted = true;
    }
  }

  cancel() {
    if (!this.transmitted) {
      this.cleanup();
      tracingMetrics.incrementClosed();
      this.transmitted = true;
    }
  }

  cleanup() {
    this.cleanupFunctions.forEach(call);
    this.cleanupFunctions.length = 0;
  }

  freezePathTemplate() {
    this.pathTplFrozen = true;
  }

  disableAutoEnd() {
    this.manualEndMode = true;
  }
}

/**
 * Overrides transmit and cancel so that a pseudo span is not put into the span buffer. All other behaviour is inherited
 * from InstanaSpan.
 */
class InstanaPseudoSpan extends InstanaSpan {
  transmit() {
    if (!this.transmitted && !this.manualEndMode) {
      this.cleanup();
      this.transmitted = true;
    }
  }

  transmitManual() {
    if (!this.transmitted) {
      this.cleanup();
      this.transmitted = true;
    }
  }

  cancel() {
    if (!this.transmitted) {
      this.cleanup();
      this.transmitted = true;
    }
  }
}

/*
 * Start a new span and set it as the current span.
 */
exports.startSpan = function startSpan(spanName, kind, traceId, parentSpanId, w3cTraceContext) {
  tracingMetrics.incrementOpened();
  if (!kind || (kind !== ENTRY && kind !== EXIT && kind !== INTERMEDIATE)) {
    logger.warn('Invalid span (%s) without kind/with invalid kind: %s, assuming EXIT.', spanName, kind);
    kind = EXIT;
  }
  const span = new InstanaSpan(spanName);
  span.k = kind;

  const parentSpan = exports.getCurrentSpan();
  const parentW3cTraceContext = exports.getW3cTraceContext();

  if (serviceName != null && !parentSpan) {
    span.data.service = serviceName;
  }

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

  if (span.k === ENTRY) {
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
 * Puts a pseudo span in the CLS context that is simply a holder for a trace ID and span ID. This pseudo span will act
 * as the parent for other child span that are produced but will not be transmitted to the agent itself.
 */
exports.putPseudoSpan = function putPseudoSpan(spanName, kind, traceId, spanId) {
  if (!kind || (kind !== ENTRY && kind !== EXIT && kind !== INTERMEDIATE)) {
    logger.warn('Invalid pseudo span (%s) without kind/with invalid kind: %s, assuming EXIT.', spanName, kind);
    kind = EXIT;
  }
  const span = new InstanaPseudoSpan(spanName);
  span.k = kind;

  if (!traceId) {
    logger.warn('Cannot start a pseudo span without a trace ID', spanName, kind);
    return;
  }
  if (!spanId) {
    logger.warn('Cannot start a pseudo span without a span ID', spanName, kind);
    return;
  }

  span.t = traceId;
  span.s = spanId;

  if (span.k === ENTRY) {
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
  const tl = exports.tracingLevel();
  return typeof tl === 'string' && tl.indexOf('0') === 0;
};

exports.getAsyncContext = function getAsyncContext() {
  if (!exports.ns) {
    return null;
  }
  return exports.ns.active;
};

/**
 * Do not use enterAsyncContext unless you absolutely have to. Instead, use one of the methods provided in the sdk,
 * that is, runInAsyncContext or runPromiseInAsyncContext.
 *
 * If you use enterAsyncContext anyway, you are responsible for also calling leaveAsyncContext later on. Leaving the
 * async context is managed automatically for you with the runXxxInAsyncContext functions.
 */
exports.enterAsyncContext = function enterAsyncContext(context) {
  if (!exports.ns) {
    return;
  }
  if (context == null) {
    logger.warn('Ignoring enterAsyncContext call because passed context was null or undefined.');
    return;
  }
  exports.ns.enter(context);
};

/**
 * Needs to be called if and only if enterAsyncContext has been used earlier.
 */
exports.leaveAsyncContext = function leaveAsyncContext(context) {
  if (!exports.ns) {
    return;
  }
  if (context == null) {
    logger.warn('Ignoring leaveAsyncContext call because passed context was null or undefined.');
    return;
  }
  exports.ns.exit(context);
};

exports.runInAsyncContext = function runInAsyncContext(context, fn) {
  if (!exports.ns) {
    return fn();
  }
  if (context == null) {
    logger.warn('Ignoring runInAsyncContext call because passed context was null or undefined.');
    return fn();
  }
  return exports.ns.runAndReturn(fn, context);
};

exports.runPromiseInAsyncContext = function runPromiseInAsyncContext(context, fn) {
  if (!exports.ns) {
    return fn();
  }
  if (context == null) {
    logger.warn('Ignoring runPromiseInAsyncContext call because passed context was null or undefined.');
    return fn();
  }
  return exports.ns.runPromise(fn, context);
};

function call(fn) {
  fn();
}
