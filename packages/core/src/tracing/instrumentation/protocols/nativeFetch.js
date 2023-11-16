/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable max-len */

'use strict';

const semver = require('semver');
const cls = require('../../cls');
const constants = require('../../constants');
const {
  getExtraHeadersFromFetchHeaders,
  getExtraHeadersCaseInsensitive,
  mergeExtraHeadersFromFetchHeaders
} = require('./captureHttpHeadersUtil');
const tracingUtil = require('../../tracingUtil');
const { sanitizeUrl, splitAndFilter } = require('../../../util/url');

const originalFetch = global.fetch;

let extraHttpHeadersToCapture;
let isActive = false;

const addHeadersToOptionsUnconditionally =
  semver.gte(process.version, '20.8.1') ||
  (semver.gte(process.version, '18.18.2') && semver.lt(process.version, '20.0.0'));

exports.init = function init(config) {
  if (originalFetch == null) {
    // Do nothing in Node.js versions that do not support native fetch.
    return;
  }

  instrument();
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.updateConfig = function updateConfig(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.activate = function activate(extraConfig) {
  if (originalFetch == null) {
    // Do nothing in Node.js versions that do not support native fetch.
    return;
  }

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

function instrument() {
  global.fetch = function instanaFetch() {
    // eslint-disable-next-line no-unused-vars
    let w3cTraceContext = cls.getW3cTraceContext();

    const skipTracingResult = cls.skipExitTracing({ isActive, extendedResponse: true, skipParentSpanCheck: true });

    // If there is no active entry span, we fall back to the reduced span of the most recent entry span. See comment in
    // packages/core/src/tracing/clsHooked/unset.js#storeReducedSpan.
    const parentSpan = cls.getCurrentSpan() || cls.getReducedSpan();

    const originalThis = this;
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    if (skipTracingResult.skip || !parentSpan || constants.isExitSpan(parentSpan)) {
      if (skipTracingResult.suppressed) {
        injectSuppressionHeader(originalArgs, w3cTraceContext);
      }
      return originalFetch.apply(originalThis, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan('node.http.client', constants.EXIT);

      // startSpan updates the W3C trace context and writes it back to CLS, so we have to refetch the updated context
      w3cTraceContext = cls.getW3cTraceContext();

      // See https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters -> resource for the possible variants
      // to provide a URL to fetch.
      let completeCallUrl;
      let method = 'GET';
      const resource = originalArgs[0];
      let params;
      let capturedHeaders;

      if (resource != null) {
        let rawUrl;
        if (typeof resource === 'string') {
          rawUrl = resource;
        } else if (isFetchApiRequest(resource)) {
          // The first argument is an instance of Request, see https://developer.mozilla.org/en-US/docs/Web/API/Request.
          rawUrl = resource.url;
          method = resource.method;
          capturedHeaders = getExtraHeadersFromFetchHeaders(resource.headers, extraHttpHeadersToCapture);
        } else if (typeof resource.toString === 'function') {
          // This also handles the case when the resource is a URL object, as well as any object that has a custom
          // stringifier.
          rawUrl = resource.toString();
        }
        completeCallUrl = sanitizeUrl(rawUrl);
        params = splitAndFilter(rawUrl);
      }

      const options = originalArgs[1];
      if (options) {
        if (options.method) {
          // Both the Request object and the options object can specify the HTTP method. If both are present, the
          // options object takes precedence.
          method = options.method;
        }
        if (options.headers) {
          // If the resource argument is a Fetch API Request object, we might have captured headers from that object
          // already when examining the Request object. We deliberately discard those here. This accurately represents
          // the behavior of fetch(), if there are headers in both the Request object and the options object, only the
          // headers from the options object are applied.
          if (isFetchApiHeaders(options.headers)) {
            capturedHeaders = getExtraHeadersFromFetchHeaders(options.headers, extraHttpHeadersToCapture);
          } else {
            capturedHeaders = getExtraHeadersCaseInsensitive(options.headers, extraHttpHeadersToCapture);
          }
        }
      }

      span.data.http = {
        method,
        url: completeCallUrl,
        params
      };

      span.stack = tracingUtil.getStackTrace(instanaFetch);

      injectTraceCorrelationHeaders(originalArgs, span, w3cTraceContext);

      const fetchPromise = originalFetch.apply(originalThis, originalArgs);
      fetchPromise
        .then(response => {
          span.data.http.status = response.status;
          span.ec = response.status >= 500 ? 1 : 0;
          capturedHeaders = mergeExtraHeadersFromFetchHeaders(
            capturedHeaders,
            response.headers,
            extraHttpHeadersToCapture
          );
        })
        .catch(err => {
          span.ec = 1;
          span.data.http.error = err.message;
        })
        .finally(() => {
          span.d = Date.now() - span.ts;
          if (capturedHeaders != null && Object.keys(capturedHeaders).length > 0) {
            span.data.http.header = capturedHeaders;
          }
          span.transmit();
        });

      return fetchPromise;
    });
  };
}

function injectTraceCorrelationHeaders(originalArgs, span, w3cTraceContext) {
  const headersToAdd = {
    [constants.traceIdHeaderName]: span.t,
    [constants.spanIdHeaderName]: span.s,
    [constants.traceLevelHeaderName]: '1'
  };
  addW3cTraceContextHeaders(headersToAdd, w3cTraceContext);
  injectHeaders(originalArgs, headersToAdd);
}

function injectSuppressionHeader(originalArgs, w3cTraceContext) {
  const headersToAdd = {
    [constants.traceLevelHeaderName]: '0'
  };
  addW3cTraceContextHeaders(headersToAdd, w3cTraceContext);
  injectHeaders(originalArgs, headersToAdd);
}

function addW3cTraceContextHeaders(headersToAdd, w3cTraceContext) {
  if (w3cTraceContext) {
    headersToAdd[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();
    if (w3cTraceContext.hasTraceState()) {
      headersToAdd[constants.w3cTraceState] = w3cTraceContext.renderTraceState();
    }
  }
}

function injectHeaders(originalArgs, headersToAdd) {
  // Headers can be present in the second parameter to fetch (the options object) as well as in the first parameter if
  // the first parameter is a Fetch API Request object (and not a string or a URL object). If headers are present in
  // the request object as well as in the options, the two sets of headers are _not_ merged, instead, the headers from
  // the request object are ignored and the headers from the options object are used exclusively.
  //
  // Therefore we need to pay close attention when deciding whether to inject our headers into the first or the second
  // parameter. Getting this wrong could either lead to our headers not being sent or (even worse) accidentally
  // discarding headers that were present on the original fetch call. For example, if the original call used a Fetch API
  // Request object as the first parameter and did not have a second parameter (no options object), adding headers to
  // the options would effectively discard the headers from the Request object. (Because the Fetch API gives
  // options.headers precedence over Request.headers, and it does not merge the two sets of headers.)
  //
  // To add insult to injury details of that behavior changeed between Node.js 20.8.0 and 20.8.1, with the update from
  // undici version 5.25.2 to 5.26.3: Up until Node.js version 20.8.0, if there is an options object, but it does not
  // have the headers option, the headers from the request object will be used. Starting with Node.js 20.8.1, if there
  // is an options parameters, the request object's headers will be ignored unconditionally - no matter if the options
  // object has a header option or not. This change has also been backported to Node.js 18.18.2, so versions >= 18.18.2
  // and < 20.0.0 are also affected.
  //
  // Note: If the first parameter is a Request object, it always has a headers attribute, even if that had not been
  // provided explicitly when creating the Request (that is, the constructor normalizes that to an empty Headers
  // object). Also, when the Request object's headers have been initialized with an object literal, the constructor will
  // have normalized that to a Fetch API Headers object.
  //
  // The following two tables list the relevant cases, depending on what has been passed to the original fetch() call.
  //
  // | Node.js  | Case | First Parameter (resource) | Second Parameter (options) | Action                                     |
  // | -------- | ---- | -------------------------- | -------------------------- | ------------------------------------------ |
  // |        * |  (1) | Not a Fetch API Request    | Absent                     | Create options and inject there            |
  // |        * |  (2) | Not a Fetch API Request    | Present                    | Inject headers into options                |
  // |        * |  (3) | Fetch API Request          | Absent                     | add to Request#headers, do not add options |
  // | <=20.8.0 |  (4) | Fetch API Request          | Present but has no headers | add to Request#headers                     |
  // | >=18.18.2|      |                            |                            |                                            |
  // | >=20.8.1 |  (5) | Fetch API Request          | Present but has no headers | add to options#headers                     |
  // | >=18.18.2|      |                            |                            |                                            |
  // |        * |  (6) | Fetch API Request          | Present with headers       | add to options#headers                     |
  //
  // Some additional notes:
  // * Cases (1) & (2): If the first parameter is not a Request object, it is either a simple string, a URL object or
  //   any object with a toString method that will yield the target URL. We cannot inject headers into that. If the
  //   second parameter (the options object) has been provided, we can inject the headers into it. If not, we need to
  //   create an options parameter that only has our headers.
  // * Case (3) & (4): The first parameter is a Request (potentially carrying headers) and there is either no options
  //   parameter or it does not have headers. If we would add headers to the options object, we would potentially make
  //   the Fetch API discard the headers from the request object, altering the behavior of the application. Thus, for
  //   this case, we add our headers to the Request object. The Request constructor guarantees that Request#headers
  //   exists and is a Fetch API Headers object.
  // * Case (5): This is the same case as case 5 with respect to the input, but since Node.js/undici would discard
  //   Request.headers anyway in this case starting with Node.js 20.8.1, we can (and must) add the headers as
  //   options.headers instead of Request#headers.
  // * Case (6): There is a Request object (with or without headers) and an options object with headers. The Fetch API
  //   will ignore any headers from the Request object and only use the headers from the options object, so that is
  //   where we need to add our headers as well.

  const resource = originalArgs[0];
  const options = originalArgs[1];

  if (!isFetchApiRequest(resource)) {
    // The original fetch call's first argument is not a Fetch API Request object. We can only inject headers into the
    // options object (which we might or might not need to add to the call).
    injectHeadersIntoOptions(originalArgs, headersToAdd);
  } else if (options && (options.headers || addHeadersToOptionsUnconditionally)) {
    // Node.js <= 20.8.0: The original fetch call had an options object including headers, we need to add our headers
    // there.
    // Node.js >= 20.8.1: The original fetch call had an options object. Independent of whether it contained headers, we
    // need to add our headers to the options object. Headers that may exist in the request object will be ignored.
    injectHeadersIntoOptions(originalArgs, headersToAdd);
  } else {
    // The original fetch call has no options object (or an options object without headers) and the resource argument is
    // a Fetch API Request object which carries headers. In this case, we must not add headers to the options, this
    // would effectively discard any headers existing on in the Request object.
    injectHeadersIntoRequestObject(originalArgs, headersToAdd);
  }
}

function injectHeadersIntoRequestObject(originalArgs, headersToAdd) {
  // Maintenance notice: injectHeaders only calls injectHeadersIntoRequestObject after checking that it is actually a
  // Fetch API Request object, so there is no need to check that again.
  const request = originalArgs[0];

  const existingHeaders = request.headers;
  if (existingHeaders == null || !isFetchApiHeaders(existingHeaders)) {
    // Should never happen, the Fetch API guarantees that Request.headers is a Headers object.
    return;
  }

  Object.keys(headersToAdd).forEach(key => {
    existingHeaders.set(key, headersToAdd[key]);
  });
}

function injectHeadersIntoOptions(originalArgs, headersToAdd) {
  let options = originalArgs[1];
  if (options == null) {
    // We have already determined that we need to inject headers into the options object. If it has not been provided,
    // we need to add it to the fetch call.
    originalArgs[1] = options = {};
  }

  if (typeof options !== 'object') {
    // The options arg was present, but is not an object.
    return;
  }

  let existingHeaders = options.headers;
  if (existingHeaders == null) {
    // eslint-disable-next-line no-undef
    options.headers = existingHeaders = new Headers();
  }

  if (existingHeaders && isFetchApiHeaders(existingHeaders)) {
    Object.keys(headersToAdd).forEach(key => {
      existingHeaders.set(key, headersToAdd[key]);
    });
  } else if (typeof existingHeaders === 'object') {
    Object.keys(headersToAdd).forEach(key => {
      existingHeaders[key] = headersToAdd[key];
    });
  }
}

function isFetchApiRequest(obj) {
  // The internal class we are looking for here has been renamed from Request to _Request in release 20.8.1,
  // in this commit:
  // https://github.com/nodejs/node/commit/2860631359#diff-f516ab824a7722da938a4c7c851520d39731ddeb4f7198dff4e932c5d4f8fdf7R5030
  return isType(obj, ['Request', '_Request']);
}

function isFetchApiHeaders(obj) {
  // The internal class we are looking for here has been renamed from Headers to _Header in release 20.8.1,
  // in this commit:
  // https://github.com/nodejs/node/commit/2860631359#diff-f516ab824a7722da938a4c7c851520d39731ddeb4f7198dff4e932c5d4f8fdf7R1918
  return isType(obj, ['Headers', '_Headers']);
}

function isType(obj, possibleConstructorNames) {
  return obj != null && obj.constructor && possibleConstructorNames.includes(obj.constructor.name);
}
