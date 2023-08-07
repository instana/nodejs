/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const leftPad = require('./leftPad');
const spanBuffer = require('./spanBuffer');
const tracingUtil = require('./tracingUtil');
const { ENTRY, EXIT, INTERMEDIATE, isExitSpan } = require('./constants');
const hooked = require('./clsHooked');
const tracingMetrics = require('./metrics');
/** @type {import('../logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('tracing/cls', newLogger => {
  logger = newLogger;
});

const currentEntrySpanKey = 'com.instana.entry';
const currentSpanKey = 'com.instana.span';
const reducedSpanKey = 'com.instana.reduced';
const tracingLevelKey = 'com.instana.tl';
const w3cTraceContextKey = 'com.instana.w3ctc';

// eslint-disable-next-line no-undef-init
/** @type {String} */
let serviceName;
/** @type {import('../../../collector/src/pidStore')} */
let processIdentityProvider = null;

/*
 * Access the Instana namespace in continuation local storage.
 *
 * Usage:
 *   cls.ns.get(key);
 *   cls.ns.set(key);
 *   cls.ns.run(function() {});
 */
const ns = hooked.createNamespace('instana.collector');

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 * @param {import('../../../collector/src/pidStore')} _processIdentityProvider
 */
function init(config, _processIdentityProvider) {
  if (config && config.serviceName) {
    serviceName = config.serviceName;
  }
  processIdentityProvider = _processIdentityProvider;
}

/**
 * This type is to be used across the code base, as we don't have a public explicit type for a span.
 * Also, it is often that we simply create a literal object and gradually throw few properties on it and
 * handle them as spans. This type has all span properties, but they are all optional, so we can safely
 * type these literal objects.
 * TODO: move InstanaSpan and InstanaPseudoSpan to their own file and make them publicly accessible?
 * @typedef {Object} InstanaBaseSpan
 * @property {string} [t] trace ID
 * @property {string} [p] parent span ID
 * @property {string} [s] span ID
 * @property {string} [n] type/name
 * @property {number} [k] kind
 * @property {number} [ec] error count
 * @property {number} [_ec] internal property for error count
 * @property {boolean} [ecHasBeenSetManually] whether the error count has been set manually via the SDK
 * @property {number} [ts] timestamp
 * @property {number} [d] duration
 * @property {{e?: string, h?: string, hl?: boolean, cp?: string}} [f] from section
 * @property {boolean} [tp] trace ID is from traceparent header
 * @property {string} [lt] long trace ID
 * @property {object} [ia] closest Instana ancestor span
 * @property {string} [crtp] correlation type
 * @property {string} [crid] correlation ID
 * @property {boolean} [sy] synthetic marker
 * @property {boolean} [pathTplFrozen] pathTplFrozen
 * @property {boolean} [transmitted] transmitted
 * @property {boolean} [manualEndMode] manualEndMode
 * @property {*} [stack] stack trace
 * @property {Object.<string, *>} [data]
 * @property {{s?: number, d?: number}} [b] batching information
 * @property {*} [gqd] GraphQL destination
 * @property {Function} [transmit]
 * @property {Function} [freezePathTemplate]
 * @property {Function} [disableAutoEnd]
 * @property {Function} [transmitManual]
 * @property {Function} [cancel]
 * @property {Function} [addCleanup]
 * @property {Function} [cleanup]
 */

class InstanaSpan {
  /**
   * @param {string} name
   */
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

    // The property span.ec is defined with a getter/setter instead of being a plain property. We need to be able to
    // prohibit overwriting span.ec from auto-tracing instrumentations after it has been set manually via the
    // SDK (spanHandle.markAsErroneous).
    Object.defineProperty(this, '_ec', {
      value: 0,
      writable: true,
      enumerable: false
    });
    Object.defineProperty(this, 'ec', {
      get() {
        return this._ec;
      },
      set(value) {
        if (!this.ecHasBeenSetManually) {
          this._ec = value;
        }
      },
      enumerable: true
    });
    Object.defineProperty(this, 'ecHasBeenSetManually', {
      value: false,
      writable: true,
      enumerable: false
    });

    this.ts = Date.now();
    this.d = 0;
    /** @type {Array.<*>} */
    this.stack = [];
    /** @type {Object.<string, *>} */
    this.data = {};

    // Properties for the span that are only used internally but will not be transmitted to the agent/backend,
    // therefore defined as non-enumerabled. NOTE: If you add a new property, make sure that it is also defined as
    // non-enumerable.
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
    // Marker for higher level instrumentation (like graphql.server) to not transmit the span once they are done, but
    // instead we wait for the protocol level instrumentation to finish (which then transmits the span).
    Object.defineProperty(this, 'postponeTransmit', {
      value: false,
      configurable: true,
      writable: true,
      enumerable: false
    });
    // Additional special purpose marker that is only used to control transmission logig between the GraphQL server core
    // instrumentation and Apollo Gateway instrumentation
    // (see packages/core/tracing/instrumentation/protocols/graphql.js).
    Object.defineProperty(this, 'postponeTransmitApolloGateway', {
      value: false,
      configurable: true,
      writable: true,
      enumerable: false
    });
  }

  /**
   * @param {Function} fn
   */
  addCleanup(fn) {
    // @ts-ignore
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
    // @ts-ignore
    this.cleanupFunctions.forEach(call);
    // @ts-ignore
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

/**
 * Start a new span and set it as the current span.
 * @param {string} spanName
 * @param {number} kind
 * @param {string} traceId
 * @param {string} parentSpanId
 * @param {import('./w3c_trace_context/W3cTraceContext')} [w3cTraceContext]
 * @returns {InstanaSpan}
 */
function startSpan(spanName, kind, traceId, parentSpanId, w3cTraceContext) {
  tracingMetrics.incrementOpened();
  if (!kind || (kind !== ENTRY && kind !== EXIT && kind !== INTERMEDIATE)) {
    logger.warn('Invalid span (%s) without kind/with invalid kind: %s, assuming EXIT.', spanName, kind);
    kind = EXIT;
  }
  const span = new InstanaSpan(spanName);
  span.k = kind;

  const parentSpan = getCurrentSpan();
  const parentW3cTraceContext = getW3cTraceContext();

  if (serviceName != null) {
    span.data.service = serviceName;
  }

  // If the client code has specified a trace ID/parent ID, use the provided IDs.
  if (traceId) {
    // The incoming trace ID/span ID from an upstream tracer could be shorter than the standard length. Some of our code
    // (in particular, the binary Kafka trace correlation header X_INSTANA_C) assumes the standard length. We normalize
    // both IDs here by left-padding with 0 characters.

    // Maintenance note (128-bit-trace-ids): When we switch to 128 bit trace IDs, we need to left-pad the trace ID to 32
    // characters instead of 16.
    span.t = leftPad(traceId, 16);
    if (parentSpanId) {
      span.p = leftPad(parentSpanId, 16);
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
    span.addCleanup(ns.set(w3cTraceContextKey, w3cTraceContext));
  }

  if (span.k === ENTRY) {
    // Make the entry span available independently (even if getCurrentSpan would return an intermediate or an exit at
    // any given moment). This is used by the instrumentations of web frameworks like Express.js to add path templates
    // and error messages to the entry span.
    span.addCleanup(ns.set(currentEntrySpanKey, span));
  }

  // Set the span object as the currently active span in the active CLS context and also add a cleanup hook for when
  // this span is transmitted.
  span.addCleanup(ns.set(currentSpanKey, span));
  return span;
}

/**
 * Puts a pseudo span in the CLS context that is simply a holder for a trace ID and span ID. This pseudo span will act
 * as the parent for other child span that are produced but will not be transmitted to the agent itself.
 * @param {string} spanName
 * @param {number} kind
 * @param {string} traceId
 * @param {string} spanId
 */
function putPseudoSpan(spanName, kind, traceId, spanId) {
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
    span.addCleanup(ns.set(currentEntrySpanKey, span));
  }

  // Set the span object as the currently active span in the active CLS context and also add a cleanup hook for when
  // this span is transmitted.
  span.addCleanup(ns.set(currentSpanKey, span));
  return span;
}

/*
 * Get the currently active entry span.
 */
function getCurrentEntrySpan() {
  return ns.get(currentEntrySpanKey);
}

/**
 * Set the currently active span.
 * @param {InstanaSpan} span
 */
function setCurrentSpan(span) {
  ns.set(currentSpanKey, span);
}

/**
 * Get the currently active span.
 * @param {boolean} [fallbackToSharedContext=false]
 * @returns {InstanaBaseSpan}
 */
function getCurrentSpan(fallbackToSharedContext = false) {
  return ns.get(currentSpanKey, fallbackToSharedContext);
}

/**
 * Get the reduced backup of the last active span in this cls context.
 * @param {boolean} [fallbackToSharedContext=false]
 */
function getReducedSpan(fallbackToSharedContext = false) {
  return ns.get(reducedSpanKey, fallbackToSharedContext);
}

/**
 * Stores the W3C trace context object.
 * @param {import('./w3c_trace_context/W3cTraceContext')} traceContext
 */
function setW3cTraceContext(traceContext) {
  ns.set(w3cTraceContextKey, traceContext);
}

/*
 * Returns the W3C trace context object.
 */
function getW3cTraceContext() {
  return ns.get(w3cTraceContextKey);
}

/*
 * Determine if we're currently tracing or not.
 */
function isTracing() {
  return !!ns.get(currentSpanKey);
}

/**
 * Set the tracing level
 * @param {string} level
 */
function setTracingLevel(level) {
  ns.set(tracingLevelKey, level);
}

/*
 * Get the tracing level (if any)
 */
function tracingLevel() {
  return ns.get(tracingLevelKey);
}

/*
 * Determine if tracing is suppressed (via tracing level) for this request.
 */
function tracingSuppressed() {
  const tl = tracingLevel();
  return typeof tl === 'string' && tl.indexOf('0') === 0;
}

function getAsyncContext() {
  if (!ns) {
    return null;
  }
  return ns.active;
}

/**
 * Do not use enterAsyncContext unless you absolutely have to. Instead, use one of the methods provided in the sdk,
 * that is, runInAsyncContext or runPromiseInAsyncContext.
 *
 * If you use enterAsyncContext anyway, you are responsible for also calling leaveAsyncContext later on. Leaving the
 * async context is managed automatically for you with the runXxxInAsyncContext functions.
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 */
function enterAsyncContext(context) {
  if (!ns) {
    return;
  }
  if (context == null) {
    logger.warn('Ignoring enterAsyncContext call because passed context was null or undefined.');
    return;
  }
  ns.enter(context);
}

/**
 * Needs to be called if and only if enterAsyncContext has been used earlier.
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 */
function leaveAsyncContext(context) {
  if (!ns) {
    return;
  }
  if (context == null) {
    logger.warn('Ignoring leaveAsyncContext call because passed context was null or undefined.');
    return;
  }
  ns.exit(context);
}

/**
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 * @param {Function} fn
 */
function runInAsyncContext(context, fn) {
  if (!ns) {
    return fn();
  }
  if (context == null) {
    logger.warn('Ignoring runInAsyncContext call because passed context was null or undefined.');
    return fn();
  }
  return ns.runAndReturn(fn, context);
}

/**
 * @param {import('./clsHooked/context').InstanaCLSContext} context
 * @param {Function} fn
 * @returns {Function | *}
 */
function runPromiseInAsyncContext(context, fn) {
  if (!ns) {
    return fn();
  }
  if (context == null) {
    logger.warn('Ignoring runPromiseInAsyncContext call because passed context was null or undefined.');
    return fn();
  }
  return ns.runPromise(fn, context);
}

/**
 * @param {Function} fn
 */
function call(fn) {
  fn();
}
/**
 * This method should be used in all exit instrumentations.
 * It checks whether the tracing shoud be skipped or not.
 *
 * | options             | description
 * --------------------------------------------------------------------------------------------
 * | isActive            | Whether the instrumentation is active or not.
 * | extendedResponse    | By default the method returns a boolean. Sometimes it's helpful to
 * |                     | get the full response when you would like to determine why it was skipped.
 * |                     | For example because of suppression.
 * | skipParentSpanCheck | Some instrumentations have a very specific handling for checking the parent span.
 * |                     | With this flag you can skip the default parent span check.
 * | log                 | Logger instrumentations might not want to log because they run into recursive
 * |                     | problem raising `RangeError: Maximum call stack size exceeded`.
 * | skipIsTracing       | Instrumentation wants to handle `cls.isTracing` on it's own (e.g db2)
 *
 * @param {Object.<string, *>} options
 */
function skipExitTracing(options) {
  const opts = Object.assign(
    {
      isActive: true,
      extendedResponse: false,
      skipParentSpanCheck: false,
      log: true,
      skipIsTracing: false
    },
    options
  );

  const parentSpan = getCurrentSpan();
  const suppressed = tracingSuppressed();
  const isExitSpanResult = isExitSpan(parentSpan);

  // CASE: first ask for suppressed, because if we skip the entry span, we won't have a parentSpan
  //       on the exit span, which would create noisy log messages.
  if (suppressed) {
    if (opts.extendedResponse) return { skip: true, suppressed, isExitSpan: isExitSpanResult };
    return true;
  }

  if (!opts.skipParentSpanCheck && (!parentSpan || isExitSpanResult)) {
    if (opts.log) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an exit span as this requires an active entry (or intermediate) span as parent. ${
          parentSpan
            ? `But the currently active span is itself an exit span: ${JSON.stringify(parentSpan)}`
            : 'Currently there is no span active at all'
        }`
      );
    }

    if (opts.extendedResponse) return { skip: true, suppressed, isExitSpan: isExitSpanResult };
    else return true;
  }

  const skipIsActive = opts.isActive === false;
  const skipIsTracing = !opts.skipIsTracing ? !isTracing() : false;
  const skip = skipIsActive || skipIsTracing;
  if (opts.extendedResponse) return { skip, suppressed, isExitSpan: isExitSpanResult };
  else return skip;
}

module.exports = {
  skipExitTracing,
  currentEntrySpanKey,
  currentSpanKey,
  reducedSpanKey,
  tracingLevelKey,
  w3cTraceContextKey,
  ns,
  init,
  startSpan,
  putPseudoSpan,
  getCurrentEntrySpan,
  setCurrentSpan,
  getCurrentSpan,
  getReducedSpan,
  setW3cTraceContext,
  getW3cTraceContext,
  isTracing,
  setTracingLevel,
  tracingLevel,
  tracingSuppressed,
  getAsyncContext,
  enterAsyncContext,
  leaveAsyncContext,
  runInAsyncContext,
  runPromiseInAsyncContext
};
