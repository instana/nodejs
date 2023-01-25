/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * Used in http server instrumentation, the headers are already lower cased in the data we receive. This method is less
 * expensive than getExtraHeadersCaseInsensitive/getExtraHeadersFromOptions.
 *
 * @param {import('http').IncomingMessage} message the request object to inspect for headers
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} an object literal with the captured headers or undefined if no headers matched the
 * extraHttpHeadersToCapture list
 */
exports.getExtraHeadersFromMessage = function getExtraHeadersFromMessage(message, extraHttpHeadersToCapture) {
  return exports.getExtraHeadersFromNormalizedObjectLiteral(message.headers, extraHttpHeadersToCapture);
};

/**
 * Used in http2 server instrumentation (and indirectly in http1 server instrumentation), the headers are already lower
 * cased in the data we receive. This method is less expensive than
 * getExtraHeadersCaseInsensitive/getExtraHeadersFromOptions.
 *
 * @param {Object.<string, string | string[]>} headers an object literal that represents the headers of an HTTP message;
 * this method expects that the keys have already been normalized to lower case
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} an object literal with the captured headers or undefined if no headers matched the
 * extraHttpHeadersToCapture list
 */
exports.getExtraHeadersFromNormalizedObjectLiteral = function getExtraHeadersFromNormalizedObjectLiteral(
  headers,
  extraHttpHeadersToCapture
) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }

  let extraHeadersFound = false;
  const /** @type Object.<string, string> */ extraHeaders = {};
  for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
    const key = extraHttpHeadersToCapture[i];
    const value = headers[key];
    if (Array.isArray(value)) {
      // If the client has set the same header multiple times, Node.js has already normalized
      // this to a single string ("value 1, value 2, ..."). However, the type definitions in Node.js core declare
      // interface IncomingHttpHeaders extends NodeJS.Dict<string | string[]>, so technically string array values
      // are allowed and we should be able to handle them.
      extraHeaders[key] = value.join(', ');
      extraHeadersFound = true;
    } else if (value) {
      extraHeaders[key] = value;
      extraHeadersFound = true;
    }
  }
  if (!extraHeadersFound) {
    return undefined;
  }
  return extraHeaders;
};

/**
 * Used in native fetch instrumentation; the headers are already normalized to a
 * Headers object (https://developer.mozilla.org/en-US/docs/Web/API/Headers) and the header names are normalized
 * to lower case.
 *
 * @param {Headers} headers a Fetch API Headers object
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} an object literal with the captured headers or undefined if no headers matched the
 * extraHttpHeadersToCapture list
 */
exports.getExtraHeadersFromFetchHeaders = function getExtraHeadersFromFetchHeaders(headers, extraHttpHeadersToCapture) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }
  let extraHeadersFound = false;
  const /** @type Object.<string, string> */ extraHeaders = {};
  for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
    const key = extraHttpHeadersToCapture[i];
    if (headers.has(key)) {
      // If the client has set the same header multiple times, Node.js has already normalized
      // this to "value 1, value 2, ..."
      extraHeaders[key] = headers.get(key);
      extraHeadersFound = true;
    }
  }
  if (!extraHeadersFound) {
    return undefined;
  }
  return extraHeaders;
};

/**
 * Used in http client instrumentation, the headers can appear in any lower case/upper case combination there. This is
 * slightly more expensive than getExtraHeadersFromMessage.
 *
 * @param {import ('http').RequestOptions} options the options object passed to http.request/http.get
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} an object literal with the captured headers or undefined if no headers matched the
 * extraHttpHeadersToCapture list
 */
exports.getExtraHeadersFromOptions = function getExtraHeadersFromOptions(options, extraHttpHeadersToCapture) {
  if (!options) {
    return undefined;
  }
  return exports.getExtraHeadersCaseInsensitive(options.headers, extraHttpHeadersToCapture);
};

/**
 * Used in http2 (and indirectly http 1.x client) instrumentation, the headers can appear in any lower case/upper case
 * combination there. This is slightly more expensive than getExtraHeadersFromNormalizedObjectLiteral.
 *
 * @param {Object.<string | number, number | string | string[]>} headers an object literal that represents the headers
 * of an HTTP request; in contrast to getExtraHeadersFromNormalizedObjectLiteral this method expects does not expect the
 * keys to have been normalized to lower case
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} an object literal with the captured headers or undefined if no headers matched the
 * extraHttpHeadersToCapture list
 */
exports.getExtraHeadersCaseInsensitive = function getExtraHeadersCaseInsensitive(headers, extraHttpHeadersToCapture) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0 || !headers || typeof headers !== 'object') {
    return undefined;
  }

  const keys = Object.keys(headers).map(key => ({
    orig: key,
    low: key.toLowerCase()
  }));
  let extraHeadersFound = false;
  const /** @type Object.<string, string> */ extraHeaders = {};
  for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
    const keyToCapture = extraHttpHeadersToCapture[i];
    for (let j = 0; j < keys.length; j++) {
      if (keys[j].low === keyToCapture) {
        extraHeaders[keys[j].low] = Array.isArray(headers[keys[j].orig])
          ? headers[keys[j].orig].join(', ')
          : headers[keys[j].orig];
        extraHeadersFound = true;
      }
    }
  }
  if (!extraHeadersFound) {
    return undefined;
  }
  return extraHeaders;
};

/**
 * This is used to merge HTTP response headers with HTTP request headers that have been captured earlier in the request
 * lifecycle (in the http server instrumentation), or to merge additional headers from multiple sources (in the http
 * client instrumentation).
 *
 * @param {Object.<string, string> | undefined} headersAlreadyCapturedIfAny an object literal representing the headers
 * that have already been captured earlier
 * @param {import('http').ServerResponse|import('http').ClientRequest} message the object to inspect for additional
 * headers; this object is assumed to have a `getHeader` method that retrieves headers in a case-insensitive fashion.
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} a new object literal with the merged captured headers, or the parameter
 * `headersAlreadyCapturedIfAny` unmodified if no new headers were found
 */
exports.mergeExtraHeadersFromServerResponseOrClientRequest =
  function mergeExtraHeadersFromServerResponseOrClientRequest(
    headersAlreadyCapturedIfAny,
    message,
    extraHttpHeadersToCapture
  ) {
    return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, key => message.getHeader(key));
  };

/**
 * This is used to merge HTTP response headers with HTTP request headers that have been captured earlier in the request
 * lifecycle (in the http client instrumentation).
 *
 * @param {Object.<string, string> | undefined} headersAlreadyCapturedIfAny an object literal representing the headers
 * that have already been captured earlier
 * @param {import('http').IncomingMessage} incomingMessage the response object to inspect for headers; this method
 * assumes that this object has a `headers` property which is an object literal where header names have been normalized
 * to lower case
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} a new object literal with the merged captured headers, or the parameter
 * `headersAlreadyCapturedIfAny` unmodified if no new headers were found
 */
exports.mergeExtraHeadersFromIncomingMessage = function mergeExtraHeadersFromIncomingMessage(
  headersAlreadyCapturedIfAny,
  incomingMessage,
  extraHttpHeadersToCapture
) {
  return exports.mergeExtraHeadersFromNormalizedObjectLiteral(
    headersAlreadyCapturedIfAny,
    incomingMessage.headers,
    extraHttpHeadersToCapture
  );
};

/**
 * This is used to merge HTTP response headers with HTTP request headers that have been captured earlier in the request
 * lifecycle (in the http 2 client instrumentation and implicitly in the http client instrumentation).
 *
 * @param {Object.<string, string> | undefined} headersAlreadyCapturedIfAny an object literal representing the headers
 * that have already been captured earlier
 * @param {Object.<string, string | string[]>} headers an object literal that represents the headers of an HTTP message;
 * this method expects that the keys have already been normalized to lower case
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} a new object literal with the merged captured headers, or the parameter
 * `headersAlreadyCapturedIfAny` unmodified if no new headers were found
 */
exports.mergeExtraHeadersFromNormalizedObjectLiteral = function mergeExtraHeadersFromNormalizedObjectLiteral(
  headersAlreadyCapturedIfAny,
  headers,
  extraHttpHeadersToCapture
) {
  if (!headers) {
    return headersAlreadyCapturedIfAny;
  }
  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, key => headers[key]);
};

/**
 * This is used to merge HTTP response headers provided in the form of a Fetch API Headers object
 * (https://developer.mozilla.org/en-US/docs/Web/API/Headers) with HTTP request headers that have been captured earlier
 * in the request lifecycle (in the native fetch instrumentation).
 *
 * @param {Object.<string, string> | undefined} headersAlreadyCapturedIfAny an object literal representing the headers
 * that have already been captured earlier
 * @param {Headers} headers a Fetch API Headers object
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} a new object literal with the merged captured headers, or the parameter
 * `headersAlreadyCapturedIfAny` unmodified if no new headers were found
 */
exports.mergeExtraHeadersFromFetchHeaders = function mergeExtraHeadersFromFetchHeaders(
  headersAlreadyCapturedIfAny,
  headers,
  extraHttpHeadersToCapture
) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0 || !headers) {
    return headersAlreadyCapturedIfAny;
  }

  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, keyToCapture =>
    headers.get(keyToCapture)
  );
};

/**
 * This is used to merge HTTP response headers with HTTP request headers that have been captured earlier in the request
 * lifecycle (in the http 2 server instrumentation). This method can handle object literals in which the keys have not
 * been normalized to lower case yet. It is slightly more expensive than mergeExtraHeadersFromNormalizedObjectLiteral.
 *
 * @param {Object.<string, string> | undefined} headersAlreadyCapturedIfAny an object literal representing the headers
 * that have already been captured earlier
 * @param {Object.<string, string | string[]>} headers an object literal that represents the headers of an HTTP message;
 * in contrast to mergeExtraHeadersFromNormalizedObjectLiteral this method does _not_ expect that the keys have already
 * been normalized to lower case
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @returns {Object | undefined} a new object literal with the merged captured headers, or the parameter
 * `headersAlreadyCapturedIfAny` unmodified if no new headers were found
 */
exports.mergeExtraHeadersCaseInsensitive = function mergeExtraHeadersCaseInsensitive(
  headersAlreadyCapturedIfAny,
  headers,
  extraHttpHeadersToCapture
) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0 || !headers) {
    return headersAlreadyCapturedIfAny;
  }

  const keys = Object.keys(headers).map(key => ({
    orig: key,
    low: key.toLowerCase()
  }));

  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, keyToCapture => {
    for (let j = 0; j < keys.length; j++) {
      if (keys[j].low === keyToCapture) {
        return headers[keys[j].orig];
      }
    }
    return null;
  });
};

/**
 * This is used to merge HTTP response headers with HTTP request headers that have been captured earlier in the request
 * lifecycle, or headers from multiple sources. It is used under the hood by all mergeExtraHeaders... methods.
 *
 * @param {Object.<string, string> | undefined} headersAlreadyCapturedIfAny an object literal representing the headers
 * that have already been captured earlier
 * @param {Array<string>} extraHttpHeadersToCapture the configured list of headers that need to be captured
 * @param {(key: string) => string | string[] | number | undefined} getHeader a function that takes a header name (from
 * the extraHttpHeadersToCapture list) and returns the header value from the HTTP request/response (or undefined, if the
 * header does not exist)
 * @returns {Object | undefined} a new object literal with the merged captured headers, or the parameter
 * `headersAlreadyCapturedIfAny` unmodified if no new headers were found
 */
function mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, getHeader) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return headersAlreadyCapturedIfAny;
  }

  let /** @type Object.<string, string> */ additionalHeaders = {};
  let additionalHeadersFound = false;
  for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
    const key = extraHttpHeadersToCapture[i];
    const value = getHeader(key);
    if (Array.isArray(value)) {
      additionalHeaders[key] = value.join(', ');
      additionalHeadersFound = true;
    } else if (typeof value === 'number') {
      additionalHeaders[key] = String(value);
      additionalHeadersFound = true;
    } else if (value) {
      additionalHeaders[key] = value;
      additionalHeadersFound = true;
    }
  }
  if (!additionalHeadersFound) {
    additionalHeaders = undefined;
  }

  if (headersAlreadyCapturedIfAny && additionalHeaders) {
    return Object.assign(headersAlreadyCapturedIfAny, additionalHeaders);
  } else if (additionalHeaders) {
    return additionalHeaders;
  }
  return headersAlreadyCapturedIfAny;
}
