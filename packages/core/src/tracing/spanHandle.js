/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const constants = require('./constants');

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * Provides very limited access from client code to the current active span.
 * @param {import('../core').InstanaBaseSpan} _span
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
 * Returns the correlation ID for end user monitoring.
 */
SpanHandle.prototype.getCorrelationId = function getCorrelationId() {
  return this.span.crid;
};

/**
 * Sets the correlation ID for end user monitoring. This method call is only effective for root entry spans, it will be
 * silently ignored otherwise.
 *
 * @param {string} correlationId the correlation ID
 */
SpanHandle.prototype.setCorrelationId = function setCorrelationId(correlationId) {
  if (this.isEntrySpan() && !this.getParentSpanId()) {
    this.span.crid = correlationId;
  }
};

/**
 * Returns the correlation type for end user monitoring.
 */
SpanHandle.prototype.getCorrelationType = function getCorrelationType() {
  return this.span.crtp;
};

/**
 * Sets the correlation type for end user monitoring. This method call is only effective for root entry spans, it will
 * be silently ignored otherwise.
 *
 * @param {string} correlationType the correlation type, either 'web' or 'mobile'
 */
SpanHandle.prototype.setCorrelationType = function setCorrelationType(correlationType) {
  if (this.isEntrySpan() && !this.getParentSpanId()) {
    this.span.crtp = correlationType;
  }
};

/**
 * Adds an annotation (also known as a tag or custom tag) to the span. The path can be provided as a dot-separated
 * string or as an array of strings. That is, the following two calls are equivalent:
 * - span.annotate('sdk.custom.tags.myTag', 'My Value'), and
 * - span.annotate(['sdk', 'custom', 'tags', 'myTag'], 'My Value').
 *
 * Note that custom tags should always be prefixed by sdk.custom.tags. You can also use this method to override standard
 * tags, like the HTTP path template (example: span.annotate('http.path_tpl', '/user/{id}/details')), but it is not
 * recommended, unless there are very good reasons to interfere with Instana's auto tracing.
 *
 * @param {string|Array.<string>} path the path of the annotation in the span object
 * @param {*} value the value for the annotation
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
 * @param {Array.<string>} path
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
 * Marks the span as an error (that is, it sets the error count for the span to 1). You can optionally provide an error
 * message. If no message is provided, a default error message will be set.
 *
 * @param {string?} errorMessage the error message to add as an annotation
 * @param {string|Array.<string>} errorMessagePath the annotation path where the error message will be written to;
 *   there is usually no need to provide this argument as this will be handled automatically
 */
SpanHandle.prototype.markAsErroneous = function markAsErroneous(
  errorMessage = 'This call has been marked as erroneous via the Instana Node.js SDK, no error message has been ' +
    'supplied.',
  errorMessagePath
) {
  // We deliberately write directly to the protected property span._ec instead of span.ec here to circumvent the write
  // protection established by ecHasBeenSetManually. A direct manual write via the SDK always has priority over anything
  // else that has potentially written before (even other earlier markAsErroneous/markAsNonErroneous calls).
  this.span._ec = 1;
  this.span.ecHasBeenSetManually = true;
  this._annotateErrorMessage(errorMessage, errorMessagePath);
};

/**
 * Marks the span as being not an error (that is, it sets the error count for the span to 0). This is useful if the span
 * has been marked erroneous previously (either by autotracing or via span.markAsErroneous) and that earlier decision
 * needs to be reverted.
 * @param {string|Array.<string>} errorMessagePath the annotation path where the error message has been written to
 *   earlier; there is usually no need to provide this argument as this will be handled automatically
 */
SpanHandle.prototype.markAsNonErroneous = function markAsNonErroneous(errorMessagePath) {
  // We deliberately write directly to the protected property span._ec instead of span.ec here to circumvent the write
  // protection established by ecHasBeenSetManually. A direct manual write via the SDK always has priority over anything
  // else that has potentially written before (even other earlier markAsErroneous/markAsNonErroneous calls).
  this.span._ec = 0;
  this.span.ecHasBeenSetManually = true;

  // reset the error message as well
  this._annotateErrorMessage(undefined, errorMessagePath);
};

/**
 * @param {string?} errorMessage
 * @param {string|Array.<string>} errorMessagePath
 */
SpanHandle.prototype._annotateErrorMessage = function _annotateErrorMessage(errorMessage, errorMessagePath) {
  if (errorMessagePath) {
    this.annotate(errorMessagePath, errorMessage);
  } else {
    findAndAnnotateErrorMessage(this.span, errorMessage);
  }
};

/**
 * @param {import('../core').InstanaBaseSpan} span
 * @param {string|Array.<string>} message
 */
function findAndAnnotateErrorMessage(span, message) {
  const data = span.data;
  if (!data) {
    logger.warn(
      'The error message annotation cannot be set in span.markAsErroneous/span.markAsNonErroneous, since the ' +
        `${span.n} span has no data object.`
    );
    return;
  }

  let potentialSpanTypeSpecificDataKeys = Object.keys(data).filter(
    key =>
      // Some db instrumentations add a span.data.peer object in addition to their main section.
      key !== 'peer' &&
      // We are only interested in actual object properties, not string properties like span.data.service etc.
      data[key] != null &&
      typeof data[key] === 'object' &&
      !Array.isArray(data[key])
  );

  if (potentialSpanTypeSpecificDataKeys.length === 0) {
    logger.warn(
      'The error message annotation cannot be set in span.markAsErroneous/span.markAsNonErroneous, since the ' +
        `data object of the ${span.n} span has no keys. Please provide the path to the error message annotation ` +
        'explicitly.'
    );
    return;
  }
  if (potentialSpanTypeSpecificDataKeys.length > 1 && potentialSpanTypeSpecificDataKeys.includes('sdk')) {
    // Example: span.data.(http|rpc|mysql|whatever) _and_ span.data.sdk.custom.tags can legitimately exist on the same
    // span when custom annotations have been added to an autotrace span.
    // In that case, we want to add the error message to the autotrace span data.
    potentialSpanTypeSpecificDataKeys = potentialSpanTypeSpecificDataKeys.filter(key => key !== 'sdk');
  }
  if (potentialSpanTypeSpecificDataKeys.length > 1) {
    logger.warn(
      'The error message annotation cannot be set in span.markAsErroneous/span.markAsNonErroneous, since the ' +
        `data object of the ${span.n} span has more than one key: ${potentialSpanTypeSpecificDataKeys.join(
          ', '
        )}. Please provide the path to the error message annotation explicitly.`
    );
    return;
  }

  const spanTypeSpecificData = data[potentialSpanTypeSpecificDataKeys[0]];
  if (message != null) {
    spanTypeSpecificData.error = message;
  } else {
    delete spanTypeSpecificData.error;
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
 * Finishes a span that has been switched to manual-end-mode before.
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
 * Cancels as span that has been switched to manual-end-mode before.
 */
SpanHandle.prototype.cancel = function cancel() {
  this.span.cancel();
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

/**
 * @returns {null}
 */
NoopSpanHandle.prototype.getCorrelationId = function getCorrelationId() {
  return null;
};

NoopSpanHandle.prototype.setCorrelationId = function setCorrelationId() {};

/**
 * @returns {null}
 */
NoopSpanHandle.prototype.getCorrelationType = function getCorrelationType() {
  return null;
};

NoopSpanHandle.prototype.setCorrelationType = function setCorrelationType() {};

NoopSpanHandle.prototype.annotate = function annotate() {};

NoopSpanHandle.prototype.markAsErroneous = function markAsErroneous() {};

NoopSpanHandle.prototype.markAsNonErroneous = function markAsNonErroneous() {};

NoopSpanHandle.prototype.disableAutoEnd = function disableAutoEnd() {
  // provide dummy operation when automatic tracing is not enabled
};

NoopSpanHandle.prototype.end = function end() {
  // provide dummy operation when automatic tracing is not enabled
};

NoopSpanHandle.prototype.cancel = function cancel() {
  // provide dummy operation when automatic tracing is not enabled
};

/**
 * @param {import('../config/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
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

// Only exported for testing purposese.
exports._SpanHandle = SpanHandle;

// Only exported for testing purposese.
exports._NoopSpanHandle = NoopSpanHandle;
