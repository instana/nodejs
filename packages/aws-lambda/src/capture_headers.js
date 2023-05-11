/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

let extraHttpHeadersToCapture = null;

exports.init = function init(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
exports.captureHeaders = function captureHeaders(data) {
  if (!extraHttpHeadersToCapture || extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }

  const extraHeaders = {};
  if (data.headers) {
    Object.keys(data.headers).forEach(key => {
      if (typeof key === 'string') {
        for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
          if (key.toLowerCase() === extraHttpHeadersToCapture[i]) {
            extraHeaders[key.toLowerCase()] = data.headers[key];
          }
        }
      }
    });
  }

  // NOTE: deprecated, this is payload format version 1.0
  if (data.multiValueHeaders) {
    Object.keys(data.multiValueHeaders).forEach(key => {
      if (typeof key === 'string') {
        for (let i = 0; i < extraHttpHeadersToCapture.length; i++) {
          if (key.toLowerCase() === extraHttpHeadersToCapture[i] && data.multiValueHeaders[key]) {
            extraHeaders[key.toLowerCase()] = data.multiValueHeaders[key].join(',');
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
