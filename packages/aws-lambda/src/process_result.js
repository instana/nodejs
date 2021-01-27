/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { headers: headersUtil } = require('@instana/serverless');

const { captureHeaders } = require('./capture_headers');

const serverTimingHeader = 'Server-Timing';

module.exports = exports = function procesResult(result, entrySpan) {
  if (result && typeof result === 'object') {
    captureStatusCode(result, entrySpan);
    captureResponseHeaders(result, entrySpan);
    injectEumBackendCorrelationHeader(result, entrySpan);
  }
};

function captureStatusCode(result, entrySpan) {
  if (typeof result.statusCode === 'number') {
    captureNumericalStatusCode(result, entrySpan);
  } else if (typeof result.statusCode === 'string' && /^\d\d\d$/.test(result.statusCode)) {
    captureStringStatusCode(result, entrySpan);
  }
}

function captureNumericalStatusCode(result, entrySpan) {
  entrySpan.data.http = entrySpan.data.http || {};
  entrySpan.data.http.status = result.statusCode;
  if (result.statusCode >= 500) {
    entrySpan.ec = entrySpan.ec ? entrySpan.ec + 1 : 1;
    entrySpan.data.lambda.error = entrySpan.data.lambda.error || `HTTP status ${result.statusCode}`;
  }
}

function captureStringStatusCode(result, entrySpan) {
  entrySpan.data.http = entrySpan.data.http || {};
  entrySpan.data.http.status = parseInt(result.statusCode, 10);
  if (entrySpan.data.http.status >= 500) {
    entrySpan.ec = entrySpan.ec ? entrySpan.ec + 1 : 1;
    entrySpan.data.lambda.error = entrySpan.data.lambda.error || `HTTP status ${result.statusCode}`;
  }
}

function captureResponseHeaders(result, entrySpan) {
  if (!entrySpan.data.http) {
    // This was not recognized as http by ./trigger.js, skip capturing headers.
    return;
  }
  const responseHeaders = captureHeaders(result);
  if (!responseHeaders) {
    return;
  }
  if (!entrySpan.data.http.header) {
    entrySpan.data.http.header = responseHeaders;
  }
  entrySpan.data.http.header = {
    ...entrySpan.data.http.header,
    ...responseHeaders
  };
}

function injectEumBackendCorrelationHeader(result, entrySpan) {
  if (exports._isLambdaProxyResponse(result)) {
    if (result.headers == null && result.multiValueHeaders == null) {
      // result has neither headers nor multiValueHeaders, arbitrarily add it to result.headers
      result.headers = { [serverTimingHeader]: createServerTimingValue(entrySpan) };
    } else if (result.headers != null && typeof result.headers === 'object' && result.multiValueHeaders == null) {
      injectIntoSingleValueHeaders(result, entrySpan, createServerTimingValue(entrySpan));
    } else {
      injectIntoHeaders(result, entrySpan, createServerTimingValue(entrySpan));
    }
  }
}

function injectIntoSingleValueHeaders(result, entrySpan) {
  // result has only headers, but not headers.multiValueHeaders, add it to result.headers
  const existingHeader = headersUtil.readHeaderKeyValuePairCaseInsensitive(result.headers, serverTimingHeader);
  if (existingHeader == null) {
    result.headers[serverTimingHeader] = createServerTimingValue(entrySpan);
  } else {
    const { key: originalServerTimingKey, value: originalServerTimingValue } = existingHeader;
    if (typeof originalServerTimingValue === 'string') {
      result.headers[originalServerTimingKey] = addToStringOrReplaceInString(originalServerTimingValue, entrySpan);
    }
  }
}

function injectIntoHeaders(result, entrySpan) {
  // result has only multi value headers or both, single and multi

  const existingHeaderMulti = headersUtil.readHeaderKeyValuePairCaseInsensitive(
    result.multiValueHeaders,
    serverTimingHeader
  );
  const existingHeaderSingle = headersUtil.readHeaderKeyValuePairCaseInsensitive(result.headers, serverTimingHeader);

  if (existingHeaderMulti != null) {
    // Server-Timing header exists in multi value headers, add it there, no matter if there is also one in single
    // value headers or not.
    const { key: originalServerTimingKey, value: originalServerTimingValue } = existingHeaderMulti;
    if (Array.isArray(originalServerTimingValue) && originalServerTimingValue.length === 0) {
      result.multiValueHeaders[originalServerTimingKey].push(createServerTimingValue(entrySpan));
    } else if (Array.isArray(originalServerTimingValue) && originalServerTimingValue.length > 0) {
      result.multiValueHeaders[originalServerTimingKey][0] = addToStringOrReplaceInString(
        result.multiValueHeaders[originalServerTimingKey][0],
        entrySpan
      );
    } else if (typeof originalServerTimingValue === 'string') {
      result.multiValueHeaders[originalServerTimingKey] = addToStringOrReplaceInString(
        originalServerTimingValue,
        entrySpan
      );
    }
  } else if (existingHeaderSingle != null && typeof existingHeaderSingle.value === 'string') {
    // concat to existing single value header
    result.headers[existingHeaderSingle.key] = addToStringOrReplaceInString(existingHeaderSingle.value, entrySpan);
  } else {
    // There is no Server-Timing header neither in the single value headers nor in multi value headers, we
    // arbitrarily add it as a multi value header.
    result.multiValueHeaders[serverTimingHeader] = [createServerTimingValue(entrySpan)];
  }
}

function addToStringOrReplaceInString(originalServerTimingValue, entrySpan) {
  const match = /^(.*)intid;desc=[0-9a-f]*(.*)$/.exec(originalServerTimingValue);
  if (match) {
    return `${match[1]}intid;desc=${entrySpan.t}${match[2]}`;
  } else {
    return `${originalServerTimingValue}, ${createServerTimingValue(entrySpan)}`;
  }
}

function createServerTimingValue(entrySpan) {
  return `intid;desc=${entrySpan.t}`;
}

exports._isLambdaProxyResponse = function _isLambdaProxyResponse(result) {
  // eslint-disable-next-line max-len
  // See https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format.
  return (
    !!result &&
    (typeof result.isBase64Encoded === 'boolean' ||
    typeof result.statusCode === 'number' ||
    typeof result.statusCode === 'string' ||
    (result.body != null && result.headers != null && typeof result.headers === 'object') || //
      (result.body != null && result.multiValueHeaders != null && typeof result.multiValueHeaders === 'object'))
  );
};
