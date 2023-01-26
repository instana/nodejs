/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

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
  // Headers can be present in the second parameter to fetch (the options object) as well as in the first parameter, if
  // and only if it is a Fetch API Request object. We need to pay close attention when deciding whether to inject our
  // headers into the first or the second parameter. Getting this wrong could either lead to our headers not being sent
  // or (even worse) accidentally discarding headers that were present on the original fetch call. For example, if the
  // original call used a Fetch API Request object as the first parameter and did not have a second parameter (no
  // options object), or that options object did not have the headers option, adding headers to the options would
  // effectively discard the headers from the Request object. (Because the Fetch API gives options.headers precedence
  // over Request.headers, and it does not merge the two sets of headers.)
  //
  // Note: If the first parameter is a Request object, it always has a headers attribute, even if that had not been
  // provieded explicitly when creating the Request (that is, the constructor normalizes that to an empty Headers
  // object). Also, when the Request object's headers have been initialized with an object literal, the constructor will
  // have normalized that to a Fetch API Headers object.
  //
  // The following two tables list the relevant cases, depending on what has been passed to the original fetch() call.
  //
  // | Case | First Parameter (resource) | Second Parameter (options) | Action                                     |
  // | ---- | -------------------------- | -------------------------- | ------------------------------------------ |
  // |  (1) | Not a Fetch API Request    | Absent                     | Create options and inject there            |
  // |  (2) | Not a Fetch API Request    | Present                    | Inject headers into options                |
  // |  (3) | Fetch API Request          | Absent                     | add to Request#headers, do not add options |
  // |  (4) | Fetch API Request          | Present but has no headers | add to Request#headers                     |
  // |  (5) | Fetch API Request          | Present with headers       | add to options#headers                     |
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
  // * Case (5): There is a Request object (with or without headers) and an options object with headers. The Fetch API
  //   will ignore any headers from the Request object and only use the headers from the options object, so that is
  //   where we need to add our headers as well.

  const resource = originalArgs[0];
  const options = originalArgs[1];

  if (!isFetchApiRequest(resource)) {
    // The original fetch call's first argument is not a Fetch API Request object. We can only inject headers into the
    // options object (which we might or might not need to add to the call).
    injectHeadersIntoOptions(originalArgs, headersToAdd);
  } else if (options && options.headers) {
    // The original fetch call had an options object including headers, we need to add our headers there.
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
  return isType(obj, 'Request');
}

function isFetchApiHeaders(obj) {
  return isType(obj, 'Headers');
}

function isType(obj, constructorName) {
  return obj != null && obj.constructor && obj.constructor.name === constructorName;
}
