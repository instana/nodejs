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
const { applyFilter } = require('../util/spanFilter');

/** @type {import('../core').GenericLogger} */
let logger;

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
/** @type {Boolean} */
let allowRootExitSpan;
/** @type {Boolean} */
let ignoreEndpointsDownStreamSuppression = true;

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
  logger = config.logger;

  if (config && config.serviceName) {
    serviceName = config.serviceName;
  }
  processIdentityProvider = _processIdentityProvider;
  allowRootExitSpan = config?.tracing?.allowRootExitSpan;
  ignoreEndpointsDownStreamSuppression = config?.tracing?.ignoreEndpointsDisableSuppression;
}

class InstanaSpan {
  /**
   * @param {string} name
   * @param {object} [data]
   */
  constructor(name, data) {
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
    this.data = data || {};

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
    // Indicates whether the span is ignored.
    // If true, the span will be excluded from tracing and not propagated.
    Object.defineProperty(this, 'isIgnored', {
      value: false,
      writable: true,
      enumerable: false
    });
    // This property was introduced as part of the ignoring endpoint feature
    // and determines whether suppression should be propagated downstream.
    // By default, downstream suppression triggered by a span is disabled.
    // This property "shouldSuppressDownstream" currently applicable only for ignoring endpoints.
    // When a span is ignored, suppression is automatically enabled (`true`),
    // propagating suppression headers downstream.
    // However, if required, downstream suppression propagation can be explicitly disabled
    // by setting this property to `false`.
    Object.defineProperty(this, 'shouldSuppressDownstream', {
      value: false,
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
 * This class represents an ignored span. We need this representation for the ignoring endpoints feature because
 * when a customer accesses the current span via `instana.currentSpan()`, we do not want to return a "NoopSpan".
 * Instead, we return this ignored span instance so the trace ID remains accessible.
 * It overrides the `transmit` and `cancel` methods to to ensure that the span is never sent, only cleaned up.
 */
// eslint-disable-next-line no-unused-vars
class InstanaIgnoredSpan extends InstanaSpan {
  /**
   * @param {string} name
   * @param {object} data
   */
  constructor(name, data) {
    super(name, data);

    this.isIgnored = true;
    // By default, downstream suppression for ignoring endpoints is enabled.
    // If the environment variable `INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION` is set,
    // should not suppress the downstream calls.
    this.shouldSuppressDownstream = !ignoreEndpointsDownStreamSuppression;
  }

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
 * @param {Object} spanAttributes
 * @param {string} [spanAttributes.spanName]
 * @param {number} [spanAttributes.kind]
 * @param {string} [spanAttributes.traceId]
 * @param {string} [spanAttributes.parentSpanId]
 * @param {import('./w3c_trace_context/W3cTraceContext')} [spanAttributes.w3cTraceContext]
 * @param {Object} [spanAttributes.spanData]
 * @returns {InstanaSpan}
 */

function startSpan(spanAttributes = {}) {
  let { spanName, kind, traceId, parentSpanId, w3cTraceContext, spanData } = spanAttributes;

  tracingMetrics.incrementOpened();
  if (!kind || (kind !== ENTRY && kind !== EXIT && kind !== INTERMEDIATE)) {
    logger.warn(`Invalid span (${spanName}) without kind/with invalid kind: ${kind}, assuming EXIT.`);
    kind = EXIT;
  }

  const span = new InstanaSpan(spanName, spanData);
  span.k = kind;

  const parentSpan = getCurrentSpan();
  const parentW3cTraceContext = getW3cTraceContext();

  if (serviceName != null) {
    span.data.service = serviceName;
  }

  // If the client code has specified a trace ID/parent ID, use the provided IDs.
  if (traceId) {
    // The incoming trace ID/span ID from an upstream tracer could be shorter than the standard length. We normalize
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

  const spanIsTraced = applyFilter(span);

  // If the span was filtered out, we do not process it further.
  // Instead, we return an 'InstanaIgnoredSpan' instance to explicitly indicate that it was excluded from tracing.
  if (!spanIsTraced) {
    return setIgnoredSpan({
      spanName: span.n,
      kind: span.k,
      traceId: span.t,
      parentId: span.p,
      data: span.data
    });
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
    logger.warn(`Invalid pseudo span (${spanName}) without kind/with invalid kind: ${kind}, assuming EXIT.`);
    kind = EXIT;
  }
  const span = new InstanaPseudoSpan(spanName);
  span.k = kind;

  if (!traceId) {
    logger.warn(`Cannot start a pseudo span without a trace ID: ${spanName}, ${kind}`);
    return;
  }
  if (!spanId) {
    logger.warn(`Cannot start a pseudo span without a span ID: ${spanName}, ${kind}`);
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

/**
 * Adds an ignored span to the CLS context, serving as a holder for a trace ID and span ID.
 * Customers can access the current span via `instana.currentSpan()`, and we avoid returning a "NoopSpan".
 * We need this ignored span instance to ensure the trace ID remains accessible for future cases such as propagating
 * the trace ID although suppression is on to reactivate a trace.
 * These spans will not be sent to the backend.
 * @param {Object} options - The options for the span.
 * @param {string} options.spanName
 * @param {number} options.kind
 * @param {string} options.traceId
 * @param {string} options.parentId
 * @param {Object} options.data
 */
function setIgnoredSpan({ spanName, kind, traceId, parentId, data = {} }) {
  if (!kind || (kind !== ENTRY && kind !== EXIT && kind !== INTERMEDIATE)) {
    logger.warn(`Invalid ignored span (${spanName}) without kind/with invalid kind: ${kind}, assuming EXIT.`);
    kind = EXIT;
  }

  const span = new InstanaIgnoredSpan(spanName, data);
  span.k = kind;
  span.t = traceId;
  span.p = parentId;

  // Setting the 'parentId' of the span to 'span.s' to ensure trace continuity.
  // Although this span doesn't physically exist, we are ignoring it, but retaining its parentId.
  // This parentId is propagated downstream.
  // The spanId does not need to be retained.
  span.s = parentId;

  if (span.k === ENTRY) {
    // Make the entry span available independently (even if getCurrentSpan would return an intermediate or an exit at
    // any given moment). This is used by the instrumentations of web frameworks like Express.js to add path templates
    // and error messages to the entry span.
    span.addCleanup(ns.set(currentEntrySpanKey, span));

    // For entry spans, we need to retain suppression information to ensure that
    // tracing is suppressed for all internal (!) subsequent outgoing (exit) calls.
    // By default, downstream suppression for ignored spans is enabled.
    // If the environment variable `INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION is set,
    // should not suppress the downstream calls.
    if (span.shouldSuppressDownstream) setTracingLevel('0');
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
 * @returns {import('../core').InstanaBaseSpan}
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
 * | skipIsTracing       | Instrumentation wants to handle `cls.isTracing` on it's own (e.g db2)
 * | checkReducedSpan    | If no active entry span is present, there is an option for
 * |                     | falling back to the most recent parent span stored as reduced span
 * |                     | by setting checkReducedSpan attribute to true.
 * | skipAllowRootExitSpanPresence | An instrumentation can ignore this feature to reduce noise.
 *
 * @param {Object.<string, *>} options
 */
function skipExitTracing(options) {
  const opts = Object.assign(
    {
      isActive: true,
      extendedResponse: false,
      skipParentSpanCheck: false,
      skipIsTracing: false,
      checkReducedSpan: false,
      skipAllowRootExitSpanPresence: false
    },
    options
  );

  let isReducedSpan = false;
  let parentSpan = getCurrentSpan();

  // If there is no active entry span, we fall back to the reduced span of the most recent entry span.
  // See comment in packages/core/src/tracing/clsHooked/unset.js#storeReducedSpan.
  if (opts.checkReducedSpan && !parentSpan) {
    parentSpan = getReducedSpan();

    // We need to remember if a reduced span was used, because for reduced spans
    // we do NOT trace anymore. The async context got already closed.
    if (parentSpan) {
      isReducedSpan = true;
    }
  }

  const suppressed = tracingSuppressed();
  const isParentSpanAnExitSpan = isExitSpan(parentSpan);

  // CASE: first ask for suppressed, because if we skip the entry span, we won't have a parentSpan
  //       on the exit span, which would create noisy log messages.
  if (suppressed) {
    if (opts.extendedResponse) {
      return { skip: true, suppressed, isExitSpan: isParentSpanAnExitSpan, parentSpan, allowRootExitSpan };
    }

    return true;
  }

  // DESC: If `allowRootExitSpan` is true, then we have to ignore if there is a parent or not.
  // NOTE: The feature completely ignores the state of `isTracing`, because
  //       every exit span would be a separate trace. `isTracing` is always false,
  //       because we don't have a parent span. The http server span also does not check of `isTracing`,
  //       because it's the root span.
  // CASE: Instrumentations can disable the `allowRootExitSpan` feature e.g. loggers.
  if (!opts.skipAllowRootExitSpanPresence && allowRootExitSpan) {
    if (opts.extendedResponse) {
      return { skip: false, suppressed, isExitSpan: isParentSpanAnExitSpan, parentSpan, allowRootExitSpan };
    }

    return false;
  }

  // Parent span check is required skipParentSpanCheck and no parent is present but an exit span only
  if (!opts.skipParentSpanCheck && (!parentSpan || isParentSpanAnExitSpan)) {
    if (opts.extendedResponse) {
      return { skip: true, suppressed, isExitSpan: isParentSpanAnExitSpan, parentSpan, allowRootExitSpan };
    }

    return true;
  }

  const skipIsActive = opts.isActive === false;
  let skipIsTracing = !opts.skipIsTracing ? !isTracing() : false;

  // See comment on top.
  if (isReducedSpan) {
    skipIsTracing = false;
  }

  const skip = skipIsActive || skipIsTracing;

  if (opts.extendedResponse) {
    return { skip, suppressed, isExitSpan: isParentSpanAnExitSpan, parentSpan, allowRootExitSpan };
  }

  return skip;
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
