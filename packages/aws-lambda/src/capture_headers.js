/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

let extraHttpHeadersToCapture = null;

exports.init = function init(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.captureHeaders = function captureHeaders(event) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }
  const extraHeaders = {};
  if (event.headers) {
    Object.keys(event.headers).forEach(key => {
      if (typeof key === 'string') {
        for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
          if (key.toLowerCase() === extraHttpHeadersToCapture[i]) {
            extraHeaders[key.toLowerCase()] = event.headers[key];
          }
        }
      }
    });
  }
  if (event.multiValueHeaders) {
    Object.keys(event.multiValueHeaders).forEach(key => {
      if (typeof key === 'string') {
        for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
          if (key.toLowerCase() === extraHttpHeadersToCapture[i] && event.multiValueHeaders[key]) {
            extraHeaders[key.toLowerCase()] = event.multiValueHeaders[key].join(',');
          }
        }
      }
    });
  }
  if (Object.keys(extraHeaders).length === 0) {
    return undefined;
  }
  return extraHeaders;
};
