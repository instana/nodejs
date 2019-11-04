'use strict';

const { headers: headersUtil } = require('@instana/serverless');

const serverTimingHeader = 'Server-Timing';

module.exports = exports = function procesResult(result, entrySpan) {
  if (result && typeof result === 'object') {
    captureStatusCode(result, entrySpan);
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

function injectEumBackendCorrelationHeader(result, entrySpan) {
  if (exports._isLambdaProxyResponse(result)) {
    const eumServerTimingValue = `intid;desc=${entrySpan.t}`;

    if (result.headers == null && result.multiValueHeaders == null) {
      // result has neither headers nor multiValueHeaders, arbitrarily add it to result.headers
      result.headers = { [serverTimingHeader]: eumServerTimingValue };
    } else if (result.headers != null && typeof result.headers === 'object' && result.multiValueHeaders == null) {
      injectIntoSingleValueHeaders(result, entrySpan, eumServerTimingValue);
    } else {
      injectIntoHeaders(result, entrySpan, eumServerTimingValue);
    }
  }
}

function injectIntoSingleValueHeaders(result, entrySpan, eumServerTimingValue) {
  // result has only headers, but not headers.multiValueHeaders, add it to result.headers
  const existingHeader = headersUtil.readHeaderKeyValuePairCaseInsensitive(result.headers, serverTimingHeader);
  if (existingHeader == null) {
    result.headers[serverTimingHeader] = eumServerTimingValue;
  } else {
    const { key: originalServerTimingKey, value: originalServerTimingValue } = existingHeader;
    if (typeof originalServerTimingValue === 'string') {
      result.headers[originalServerTimingKey] = `${originalServerTimingValue}, ${eumServerTimingValue}`;
    }
  }
}

function injectIntoHeaders(result, entrySpan, eumServerTimingValue) {
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
      result.multiValueHeaders[originalServerTimingKey].push(eumServerTimingValue);
    } else if (Array.isArray(originalServerTimingValue) && originalServerTimingValue.length > 0) {
      result.multiValueHeaders[originalServerTimingKey][0] = `${
        result.multiValueHeaders[originalServerTimingKey][0]
      }, ${eumServerTimingValue}`;
    } else if (typeof originalServerTimingValue === 'string') {
      result.multiValueHeaders[originalServerTimingKey] = `${originalServerTimingValue}, ${eumServerTimingValue}`;
    }
  } else if (existingHeaderSingle != null && typeof existingHeaderSingle.value === 'string') {
    // concat to existing single value header
    result.headers[existingHeaderSingle.key] = `${existingHeaderSingle.value}, ${eumServerTimingValue}`;
  } else {
    // There is no Server-Timing header neither in the single value headers nor in multi value headers, we
    // arbitrarily attach it to the multi value headers.
    result.multiValueHeaders[serverTimingHeader] = [eumServerTimingValue];
  }
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
