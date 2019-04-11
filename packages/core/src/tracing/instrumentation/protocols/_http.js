'use strict';

exports.getExtraHeaders = function getExtraHeaders(incomingMessage, extraHttpHeadersToCapture) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }

  var extraHeaders = {};
  for (var i = 0; i < extraHttpHeadersToCapture.length; i++) {
    var key = extraHttpHeadersToCapture[i];
    var value = incomingMessage.headers[key];
    if (value) {
      extraHeaders[key] = value;
    }
  }
  return extraHeaders;
};
