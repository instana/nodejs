/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/*
 * Used in http server instrumentation, the headers are already lower cased in the data we receive. This method is less
 * expensive than getExtraHeadersCaseInsensitive/getExtraHeadersFromOptions.
 */
exports.getExtraHeadersFromMessage = function getExtraHeadersFromMessage(message, extraHttpHeadersToCapture) {
  return exports.getExtraHeadersFromHeaders(message.headers, extraHttpHeadersToCapture);
};

/*
 * Used in http2 server instrumentation (and indirectly in http1 server instrumentation), the headers are already lower
 * cased in the data we receive. This method is less expensive than
 * getExtraHeadersCaseInsensitive/getExtraHeadersFromOptions.
 */
exports.getExtraHeadersFromHeaders = function getExtraHeadersFromHeaders(headers, extraHttpHeadersToCapture) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }

  let extraHeadersFound = false;
  const extraHeaders = {};
  for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
    const key = extraHttpHeadersToCapture[i];
    const value = headers[key];
    if (value) {
      // If the client has set the same header multiple times, Node.js has already normalized
      // this to "value 1, value 2, ..."
      extraHeaders[key] = value;
      extraHeadersFound = true;
    }
  }
  if (!extraHeadersFound) {
    return undefined;
  }
  return extraHeaders;
};

/*
 * Used in http client instrumentation, the headers can appear in any lower case/upper case combination there. This is
 * slightly more expensive than getExtraHeadersFromMessage.
 */
exports.getExtraHeadersFromOptions = function getExtraHeadersFromOptions(options, extraHttpHeadersToCapture) {
  if (!options) {
    return undefined;
  }
  return exports.getExtraHeadersCaseInsensitive(options.headers, extraHttpHeadersToCapture);
};

/*
 * Used in http2 (and indirectly http 1.x client) instrumentation, the headers can appear in any lower case/upper case
 * combination there. This is slightly more expensive than getExtraHeadersFromMessage.
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
  const extraHeaders = {};
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

exports.mergeExtraHeadersFromServerResponseOrClientResponse =
  function mergeExtraHeadersFromServerResponseOrClientResponse(
    headersAlreadyCapturedIfAny,
    serverResponse,
    extraHttpHeadersToCapture
  ) {
    return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, key =>
      serverResponse.getHeader(key)
    );
  };

exports.mergeExtraHeadersFromIncomingMessage = function mergeExtraHeadersFromIncomingMessage(
  headersAlreadyCapturedIfAny,
  incomingMessage,
  extraHttpHeadersToCapture
) {
  return exports.mergeExtraHeadersFromHeaders(
    headersAlreadyCapturedIfAny,
    incomingMessage.headers,
    extraHttpHeadersToCapture
  );
};

exports.mergeExtraHeadersFromHeaders = function mergeExtraHeadersFromHeaders(
  headersAlreadyCapturedIfAny,
  headers,
  extraHttpHeadersToCapture
) {
  if (!headers) {
    return headersAlreadyCapturedIfAny;
  }
  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, key => headers[key]);
};

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

function mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, getHeader) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return headersAlreadyCapturedIfAny;
  }

  let additionalHeadersFound = false;
  let additionalHeaders = {};
  for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
    const key = extraHttpHeadersToCapture[i];
    const value = getHeader(key);
    if (Array.isArray(value)) {
      additionalHeaders[key] = value.join(', ');
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
