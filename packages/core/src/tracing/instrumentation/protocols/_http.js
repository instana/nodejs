'use strict';

/*
 * Used in http server instrumentation, the headers are already lower cased in the data we receive. This method is less
 * expensive than getExtraHeadersCaseInsensitive.
 */
exports.getExtraHeaders = function getExtraHeaders(message, extraHttpHeadersToCapture) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }

  var extraHeadersFound = false;
  var extraHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var key = extraHttpHeadersToCapture[i];
    var value = message.headers[key];
    if (value) {
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
 * slightly more expensive than getExtraHeaders.
 */
exports.getExtraHeadersCaseInsensitive = function getExtraHeaders(options, extraHttpHeadersToCapture) {
  if (
    !extraHttpHeadersToCapture ||
    extraHttpHeadersToCapture.length === 0 ||
    !options ||
    !options.headers ||
    typeof options.headers !== 'object'
  ) {
    return undefined;
  }

  var keys = Object.keys(options.headers).map(function(key) {
    return { orig: key, low: key.toLowerCase() };
  });
  var extraHeadersFound = false;
  var extraHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var keyToCapture = extraHttpHeadersToCapture[i];
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].low === keyToCapture) {
        extraHeaders[keys[j].low] = options.headers[keys[j].orig];
        extraHeadersFound = true;
      }
    }
  }
  if (!extraHeadersFound) {
    return undefined;
  }
  return extraHeaders;
};

// eslint-disable-next-line max-len
exports.mergeExtraHeadersFromServerResponseOrClientResponse = function mergeExtraHeadersFromServerResponseOrClientResponse(
  headersAlreadyCapturedIfAny,
  serverResponse,
  extraHttpHeadersToCapture
) {
  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, function(key) {
    return serverResponse.getHeader(key);
  });
};

exports.mergeExtraHeadersFromIncomingMessage = function mergeExtraHeadersForExit(
  headersAlreadyCapturedIfAny,
  incomingMessage,
  extraHttpHeadersToCapture
) {
  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, function(key) {
    return incomingMessage.headers[key];
  });
};

function mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, getHeader) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return headersAlreadyCapturedIfAny;
  }

  var additionalHeadersFound = false;
  var additionalHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var key = extraHttpHeadersToCapture[i];
    var value = getHeader(key);
    if (value) {
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
