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

  var extraHeadersFound = false;
  var extraHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var key = extraHttpHeadersToCapture[i];
    var value = headers[key];
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

  var keys = Object.keys(headers).map(function(key) {
    return { orig: key, low: key.toLowerCase() };
  });
  var extraHeadersFound = false;
  var extraHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var keyToCapture = extraHttpHeadersToCapture[i];
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].low === keyToCapture) {
        extraHeaders[keys[j].low] = headers[keys[j].orig];
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
  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, function(key) {
    return headers[key];
  });
};

exports.mergeExtraHeadersCaseInsensitive = function mergeExtraHeadersCaseInsensitive(
  headersAlreadyCapturedIfAny,
  headers,
  extraHttpHeadersToCapture
) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0 || !headers) {
    return headersAlreadyCapturedIfAny;
  }

  var keys = Object.keys(headers).map(function(key) {
    return { orig: key, low: key.toLowerCase() };
  });

  return mergeExtraHeaders(headersAlreadyCapturedIfAny, extraHttpHeadersToCapture, function(keyToCapture) {
    for (var j = 0; j < keys.length; j++) {
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
