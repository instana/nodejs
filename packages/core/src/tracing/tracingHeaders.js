'use strict';

const constants = require('./constants');
const tracingUtil = require('./tracingUtil');
const w3c = require('./w3c_trace_context');

/**
 * Inspects the headers of an incoming HTTP request for X-INSTANA-T, X-INSTANA-S, X-INSTANA-L, as well as the W3C trace
 * context headers traceparent and tracestate.
 */
exports.fromHttpRequest = function fromHttpRequest(req) {
  if (!req || !req.headers) {
    req = { headers: {} };
  }
  return exports.fromHeaders(req.headers);
};

/**
 * Inspects the given headers for X-INSTANA-T, X-INSTANA-S, X-INSTANA-L, as well as the W3C trace
 * context headers traceparent and tracestate.
 */
exports.fromHeaders = function fromHeaders(headers) {
  let xInstanaT = readInstanaTraceId(headers);
  let xInstanaS = readInstanaParentId(headers);
  const levelAndCorrelation = readLevelAndCorrelation(headers);
  const level = levelAndCorrelation.level;
  let correlationType = levelAndCorrelation.correlationType;
  let correlationId = levelAndCorrelation.correlationId;
  const synthetic = readSyntheticMarker(headers);
  let w3cTraceContext = readW3cTraceContext(headers);

  if (correlationType && correlationId) {
    // Ignore X-INSTANA-T/-S and force starting a new span if we received correlation info.
    xInstanaT = null;
    xInstanaS = null;
  }

  if (isSuppressed(level)) {
    // Ignore X-INSTANA-T/-S if X-INSTANA-L: 0 is also present.
    xInstanaT = null;
    xInstanaS = null;
    // Also discard correlation info when level is 0.
    correlationType = null;
    correlationId = null;
  }

  if (xInstanaT && xInstanaS && w3cTraceContext) {
    // X-INSTANA- headers *and* W3C trace context headers are present. We use the X-NSTANA- values for tracing and also
    // keep the received W3C trace context around.
    const result = {
      traceId: xInstanaT,
      parentId: xInstanaS,
      level,
      correlationType,
      correlationId,
      synthetic,
      w3cTraceContext
    };
    if (traceStateHasInstanaKeyValuePair(w3cTraceContext) && w3cTraceContext.traceStateHead) {
      result.foreignParent = {
        t: w3cTraceContext.foreignTraceId,
        p: w3cTraceContext.foreignParentId,
        lts: w3cTraceContext.getMostRecentForeignTraceStateMember()
      };
    }
    return result;
  } else if (xInstanaT && xInstanaS) {
    // X-INSTANA- headers are present but W3C trace context headers are not. Use the received IDs and also create a W3C
    // trace context based on those IDs.
    return {
      traceId: xInstanaT,
      parentId: xInstanaS,
      level,
      correlationType,
      correlationId,
      synthetic,
      w3cTraceContext: w3c.create(xInstanaT, xInstanaS, !isSuppressed(level))
    };
  } else if (w3cTraceContext) {
    // X-INSTANA- headers are not present but W3C trace context headers are.
    if (traceStateHasInstanaKeyValuePair(w3cTraceContext)) {
      // The W3C tracestate header has an in key-value pair. We use the values from it as trace ID and parent ID.
      return {
        traceId: !isSuppressed(level) ? w3cTraceContext.instanaTraceId : null,
        parentId: !isSuppressed(level) ? w3cTraceContext.instanaParentId : null,
        level,
        correlationType,
        correlationId,
        synthetic,
        w3cTraceContext,
        foreignParent: {
          t: w3cTraceContext.foreignTraceId,
          p: w3cTraceContext.foreignParentId,
          lts: w3cTraceContext.getMostRecentForeignTraceStateMember()
        }
      };
    } else {
      // The W3C tracestate header has no in key-value pair. We start a new Instana trace by generating a trace ID,
      // at the same time, we keep the W3C trace context we received intact and will propagate it further.
      // The w3cTraceContext has no instanaTraceId/instanaParentId yet, it will get one as soon as we start a span
      // and upate it. In case we received X-INSTANA-L: 0 we will not start a span, but we will make sure to toggle the
      // sampled flag in traceparent off.
      return {
        traceId: !isSuppressed(level) ? tracingUtil.generateRandomTraceId() : null,
        parentId: null,
        level,
        correlationType,
        correlationId,
        synthetic,
        w3cTraceContext,
        foreignParent: {
          t: w3cTraceContext.foreignTraceId,
          p: w3cTraceContext.foreignParentId,
          lts: w3cTraceContext.getMostRecentForeignTraceStateMember()
        }
      };
    }
  } else {
    // Neither X-INSTANA- headers nor W3C trace context headers are present.
    // eslint-disable-next-line no-lonely-if
    if (isSuppressed(level)) {
      // If tracing is suppressed and no headers are incoming, we need to create new random trace and parent IDs (and
      // pass them down in the traceparent header); this trace and parent IDs ares not actually associated with any
      // existing span (Instana or foreign). This can't be helped, the spec mandates to always set the traceparent
      // header on outgoing requests, even if we didn't sample and it has to have a parent ID field.
      return {
        level,
        synthetic,
        w3cTraceContext: w3c.createEmptyUnsampled(
          tracingUtil.generateRandomTraceId(),
          tracingUtil.generateRandomSpanId()
        )
        // We do not add foreignParent header here because we didn't receive any W3C trace context spec headers.
      };
    } else {
      // Neither X-INSTANA- headers nor W3C trace context headers are present and tracing is not suppressed
      // via X-INSTANA-L. Start a new trace, that is, generate a trace ID and use it for for our trace ID as well as in
      // the W3C trace context.
      xInstanaT = tracingUtil.generateRandomTraceId();
      // We create a new dummy W3C trace context with an invalid parent ID, as we have no parent ID yet. Later, in
      // cls.startSpan, we will update it so it gets the parent ID of the entry span we create there. The bogus
      // parent ID "000..." will never be transmitted to any other service.
      w3cTraceContext = w3c.create(xInstanaT, '0000000000000000', true);
      return {
        traceId: xInstanaT,
        parentId: null,
        level,
        correlationType,
        correlationId,
        synthetic,
        w3cTraceContext
        // We do not add foreignParent header here because we didn't receive any W3C trace context spec headers.
      };
    }
  }
};

function readInstanaTraceId(headers) {
  const xInstanaT = headers[constants.traceIdHeaderNameLowerCase];
  if (xInstanaT == null) {
    return null;
  }
  return xInstanaT;
}

function readInstanaParentId(headers) {
  const xInstanaS = headers[constants.spanIdHeaderNameLowerCase];
  if (xInstanaS == null) {
    return null;
  }
  return xInstanaS;
}

function readLevelAndCorrelation(headers) {
  const xInstanaL = headers[constants.traceLevelHeaderNameLowerCase];
  if (xInstanaL == null) {
    // fast path for when we did not receive the header at all
    return {};
  }
  if (xInstanaL.length === 1 && (xInstanaL === '0' || xInstanaL === '1')) {
    // fast path for valid header without correlation information
    return { level: xInstanaL };
  } else if (xInstanaL.length === 1) {
    // invalid value, ignore
    return {};
  }

  let level = xInstanaL[0];
  let correlationType = null;
  let correlationId = null;
  if (level !== '0' && level !== '1') {
    level = null;
  }

  const parts = xInstanaL.split(',');
  if (parts.length > 1) {
    const idxType = parts[1].indexOf('correlationType=');
    const idxSemi = parts[1].indexOf(';');
    const idxId = parts[1].indexOf('correlationId=');
    if (idxType >= 0 && idxSemi > 0 && idxId > 0) {
      correlationType = parts[1].substring(idxType + 16, idxSemi);
      if (correlationType) {
        correlationType = correlationType.trim();
      }
      correlationId = parts[1].substring(idxId + 14);
      if (correlationId) {
        correlationId = correlationId.trim();
      }
    }
  }
  return {
    level,
    correlationType,
    correlationId
  };
}

function isSuppressed(level) {
  return typeof level === 'string' && level.indexOf('0') === 0;
}

function readSyntheticMarker(headers) {
  return headers[constants.syntheticHeaderNameLowerCase] === '1';
}

function traceStateHasInstanaKeyValuePair(w3cTraceContext) {
  return w3cTraceContext.instanaTraceId && w3cTraceContext.instanaParentId;
}

function readW3cTraceContext(headers) {
  const traceParent = headers[constants.w3cTraceParent];
  // The spec mandates that multiple tracestate headers should be treated by concatenating them. Node.js' http core
  // library takes care of that already.
  const traceState = headers[constants.w3cTraceState];
  let traceContext;
  if (traceParent) {
    traceContext = w3c.parse(traceParent, traceState);
  }

  if (traceContext) {
    if (!traceContext.traceParentValid) {
      traceContext = null;
    } else if (!traceContext.traceStateValid) {
      traceContext.resetTraceState();
    }
  }

  return traceContext;
}
