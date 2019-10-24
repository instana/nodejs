'use strict';

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

exports.mergeExtraHeaders = function mergeExtraHeaders(
  headersAlreadyCapturedIfAny,
  message,
  extraHttpHeadersToCapture
) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return headersAlreadyCapturedIfAny;
  }

  var additionalHeadersFound = false;
  var additionalHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var key = extraHttpHeadersToCapture[i];
    var value = message.getHeader(key);
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
};
