/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const coreHttpsModule = require('https');
const coreHttpModule = require('http');

const constants = require('../../constants');
const tracingHeaders = require('../../tracingHeaders');
const { filterParams, sanitizeUrl } = require('../../../util/url');
const {
  getExtraHeadersFromMessage,
  mergeExtraHeadersFromServerResponseOrClientRequest
} = require('./captureHttpHeadersUtil');
const shimmer = require('../../shimmer');
const cls = require('../../cls');
let extraHttpHeadersToCapture;
let isActive = false;

exports.spanName = 'node.http.server';

exports.init = function init(config) {
  shimmer.wrap(coreHttpModule.Server && coreHttpModule.Server.prototype, 'emit', shimEmit);
  shimmer.wrap(coreHttpsModule.Server && coreHttpsModule.Server.prototype, 'emit', shimEmit);
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.updateConfig = function updateConfig(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.activate = function activate(extraConfig) {
  if (
    extraConfig &&
    extraConfig.tracing &&
    extraConfig.tracing.http &&
    Array.isArray(extraConfig.tracing.http.extraHttpHeadersToCapture)
  ) {
    extraHttpHeadersToCapture = extraConfig.tracing.http.extraHttpHeadersToCapture;
  }
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function shimEmit(realEmit) {
  return function (type, req, res) {
    if (type !== 'request' || !isActive) {
      return realEmit.apply(this, arguments);
    }

    const originalThis = this;
    const originalArgs = arguments;

    return cls.ns.runAndReturn(() => {
      if (req && req.on && req.addListener && req.emit) {
        cls.ns.bindEmitter(req);
      }
      if (res && res.on && res.addListener && res.emit) {
        cls.ns.bindEmitter(res);
      }
      const headers = tracingHeaders.fromHttpRequest(req);
      const w3cTraceContext = headers.w3cTraceContext;

      if (typeof headers.level === 'string' && headers.level.indexOf('0') === 0) {
        cls.setTracingLevel('0');
        if (w3cTraceContext) {
          w3cTraceContext.disableSampling();
        }
      }

      if (w3cTraceContext) {
        // Ususally we commit the W3C trace context to CLS in start span, but in some cases (e.g. when suppressed),
        // we don't call startSpan, so we write to CLS here unconditionally. If we also write an updated trace context
        // later, the one written here will be overwritten.
        cls.setW3cTraceContext(w3cTraceContext);
      }

      if (cls.tracingSuppressed()) {
        // We still need to forward X-INSTANA-L and the W3C trace context; this happens in exit instrumentations
        // (like httpClient.js).
        return realEmit.apply(originalThis, originalArgs);
      }
      // Capture the URL before application code gets access to the incoming message. Libraries like express manipulate
      // req.url when routers are used.
      const urlParts = req.url.split('?');
      if (urlParts.length >= 2) {
        urlParts[1] = filterParams(urlParts[1]);
      }
      const spanData = {
        http: {
          operation: req.method,
          endpoints: sanitizeUrl(urlParts.shift()),
          params: urlParts.length > 0 ? urlParts.join('?') : undefined,
          connection: req.headers.host,
          header: getExtraHeadersFromMessage(req, extraHttpHeadersToCapture)
        }
      };

      const span = cls.startSpan({
        spanName: exports.spanName,
        kind: constants.ENTRY,
        traceId: headers.traceId,
        parentSpanId: headers.parentId,
        w3cTraceContext: w3cTraceContext,
        spanData
      });

      tracingHeaders.setSpanAttributes(span, headers);

      if (!req.headers['x-instana-t']) {
        // In cases where we have started a fresh trace (that is, there is no X-INSTANA-T in the incoming request
        // headers, we add the new trace ID to the incoming request so a customer's app can render it reliably into the
        // EUM snippet, see
        // eslint-disable-next-line max-len
        // https://www.ibm.com/docs/en/instana-observability/current?topic=websites-backend-correlation#retrieve-the-backend-trace-id-in-nodejs
        req.headers['x-instana-t'] = span.t;
      }

      // Support for automatic client/back end EUM correlation: We add our key-value pair to the Server-Timing header
      // (the key intid is short for INstana Trace ID). This abbreviation is small enough to not incur a notable
      // overhead while at the same time being unique enough to avoid name collisions.
      const serverTimingValue = `intid;desc=${span.t}`;
      res.setHeader('Server-Timing', serverTimingValue);
      shimmer.wrap(
        res,
        'setHeader',
        realSetHeader =>
          function shimmedSetHeader(key, value) {
            if (key.toLowerCase() === 'server-timing') {
              if (value == null) {
                return realSetHeader.call(this, key, serverTimingValue);
              } else if (Array.isArray(value)) {
                if (value.find(kv => kv.indexOf('intid;') === 0)) {
                  // If the application code sets intid, do not append another intid value. Actually, the application
                  // has no business setting an intid key-value pair, but it could happen theoretically for a proxy-like
                  // Node.js app (which blindly copies headers from downstream responses) in combination with a
                  // downstream service that is also instrumented by Instana (and adds the intid key-value pair).
                  return realSetHeader.apply(this, arguments);
                } else {
                  return realSetHeader.call(this, key, value.concat(serverTimingValue));
                }
              } else if (typeof value === 'string' && value.indexOf('intid;') >= 0) {
                // Do not add another intid key-value pair, see above.
                return realSetHeader.apply(this, arguments);
              } else {
                return realSetHeader.call(this, key, `${value}, ${serverTimingValue}`);
              }
            }
            return realSetHeader.apply(this, arguments);
          }
      );

      req.on('aborted', () => {
        finishSpan();
      });

      res.on('finish', () => {
        finishSpan();
      });

      res.on('close', () => {
        // This is purely a safe guard: in all known scenarios, one of the other events that finishes the HTTP entry
        // span should have been called before (res#finish or req#aborted).
        finishSpan();
      });

      function finishSpan() {
        if (span.transmitted) {
          // We listen to multiple events like aborted, finish and close. In some scenarios, finishSpan will be called
          // multiple times. However, if the span has already been transmitted to the agent, we do not need to do
          // anything here, it has been taken care of by an earlier invocation of finishSpan.
          return;
        }

        // Always capture duration and HTTP response details, no matter if a higher level instrumentation
        // (like graphql.server) has modified the span or not.
        span.d = Date.now() - span.ts;
        span.data.http = span.data.http || {};
        if (res.headersSent) {
          span.data.http.status = res.statusCode;
          span.data.http.header = mergeExtraHeadersFromServerResponseOrClientRequest(
            span.data.http.header,
            res,
            extraHttpHeadersToCapture
          );
        }

        if (!span.postponeTransmit) {
          // Do not overwrite the error count if an instrumentation with a higher priority (like graphql.server) has
          // already made a decision about it.
          span.ec = res.statusCode >= 500 ? 1 : 0;
        }

        span.transmit();
      }

      return realEmit.apply(originalThis, originalArgs);
    });
  };
}
