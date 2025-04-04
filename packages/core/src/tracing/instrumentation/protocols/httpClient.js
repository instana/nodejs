/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const coreHttpModule = require('http');
const coreHttpsModule = require('https');
const url = require('url');
const tracingUtil = require('../../tracingUtil');
const { dropLeadingQuestionMark, filterParams, sanitizeUrl, splitAndFilter } = require('../../../util/url');
const {
  getExtraHeadersFromOptions,
  mergeExtraHeadersFromIncomingMessage,
  mergeExtraHeadersFromServerResponseOrClientRequest
} = require('./captureHttpHeadersUtil');
const constants = require('../../constants');
const cls = require('../../cls');
const hook = require('../../../util/hook');

const URL = url.URL;
let extraHttpHeadersToCapture;
let logger;
let isActive = false;

exports.init = function init(config) {
  logger = config.logger;

  instrument(coreHttpModule, false);
  instrument(coreHttpsModule, true);
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
  hook.onModuleLoad('request', logDeprecatedWarning);
};

function logDeprecatedWarning() {
  logger.warn(
    // eslint-disable-next-line max-len
    '[Deprecation Warning] The support for request library is deprecated and will be removed in the next major release. Please consider migrating to an appropriate package.'
  );
}
exports.updateConfig = function updateConfig(config) {
  extraHttpHeadersToCapture = config.tracing.http.extraHttpHeadersToCapture;
};

exports.activate = function activate(extraConfig) {
  if (
    extraConfig &&
    extraConfig.tracing &&
    extraConfig.tracing.http &&
    Array.isArray(extraConfig.tracing.http.extraHttpHeadersToCapture)
  ) {
    extraHttpHeadersToCapture = extraConfig.tracing.http.extraHttpHeadersToCapture;
  }
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

/**
 * @param {string | number | Array.<string>} headerValue
 * @param {(headerValue: string) => boolean} validator
 * @returns {boolean}
 */
function evaluateHeaderValue(headerValue, validator) {
  if (headerValue == null) {
    return false;
  }

  if (typeof headerValue === 'string' || typeof headerValue === 'number') {
    return validator(String(headerValue));
  } else if (Array.isArray(headerValue)) {
    const len = headerValue.length;

    for (let i = 0; i < len; i++) {
      if (validator(headerValue[i]) === true) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Checks whether an outgoing HTTP request should not be traced. This is intended to suppress the creation of HTTP exits
 * for which a higher level instrumentation exists, for example, HTTP requests made by AWS SQS that represent the queue
 * polling when we already created an SQS entry span for it.
 *
 * When using GCP storage library, the default way to upload a file is the resumable strategy.
 * This strategy uses google-auth-library -> gaxios -> http/https node core libs, which create http exit spans.
 * We want to suppress these spans because they have no further benefit for the customers.
 * Important: the http request happens after the gcp span async context. Therefor the parentSpan
 * is the http server entry.
 *
 * https://github.com/googleapis/nodejs-storage/blob/v6.9.4/src/resumable-upload.ts#L912
 * https://github.com/googleapis/gaxios/blob/v5.1.0/src/gaxios.ts
 *
 * @param {InstanaSpan} parentSpan The currently active parent span
 * @param {Object} options The standard lib request options:
 * https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_http_request_options_callback
 * @return {boolean} true, if the HTTP request that is about to happen should _not_ create a span.
 */
function shouldBeBypassed(parentSpan, options) {
  const headers = options && options.headers;
  const userAgent = (headers && headers['User-Agent']) || (headers && headers['user-agent']);

  const isAWSNodeJSHeader = evaluateHeaderValue(
    userAgent,
    header => header.toLowerCase().indexOf('aws-sdk-nodejs') > -1 || header.toLowerCase().indexOf('aws-sdk-js') > -1
  );

  const hostInfo = (headers && headers.Host) || (headers && headers.host);

  // Same regex used by AWS SDK at /lib/services/sqs.js
  const hostMatchesSQS = evaluateHeaderValue(hostInfo, header => header.match(/^sqs\.(?:.+?)\./) !== null);

  // 'user-agent': 'aws-sdk-js/3.329.0 os/darwin/22.5.0 lang/js md/nodejs/18.14.2 api/sqs/3.329.0'
  const agentMatchesSQS = evaluateHeaderValue(userAgent, header => header.toLowerCase().indexOf('api/sqs') > -1);

  if (parentSpan && parentSpan.n === 'sqs' && isAWSNodeJSHeader && (hostMatchesSQS || agentMatchesSQS)) {
    return true;
  }

  const isGCPNodeJSHeader = evaluateHeaderValue(
    userAgent,
    header => header.toLowerCase().indexOf('google-api-nodejs-client') > -1
  );

  const hostMatchesGPC = options && options.host && options.host === 'storage.googleapis.com';
  if (isGCPNodeJSHeader && hostMatchesGPC) return true;

  return false;
}

function instrument(coreModule, forceHttps) {
  const originalRequest = coreModule.request;
  coreModule.request = function request() {
    let clientRequest;

    // When http.request is called with http.request(options, undefined) (happens with request-promise, for example),
    // arguments.length will still be 2 but there is no callback. Even though we push a callback into the arguments
    // array, this cb will then be at index 2, thus never get called in older versions of Node, hence the span would
    // not be finished/transmitted. We normalize the args by removing undefined/null from the end.
    while (arguments.length > 0 && arguments[arguments.length - 1] == null) {
      arguments.length--;
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    let urlArg = null;
    let options = null;
    let callback = null;
    let callbackIndex = -1;

    if (typeof originalArgs[0] === 'string' || isUrlObject(originalArgs[0])) {
      urlArg = originalArgs[0];
    } else if (typeof originalArgs[0] === 'object') {
      options = originalArgs[0];
    }
    if (!options && typeof originalArgs[1] === 'object') {
      options = originalArgs[1];
    }
    if (typeof originalArgs[1] === 'function') {
      callback = originalArgs[1];
      callbackIndex = 1;
    }
    if (!callback && typeof originalArgs[2] === 'function') {
      callback = originalArgs[2];
      callbackIndex = 2;
    }

    let w3cTraceContext = cls.getW3cTraceContext();
    const skipTracingResult = cls.skipExitTracing({
      isActive,
      extendedResponse: true,
      checkReducedSpan: true
    });

    const parentSpan = skipTracingResult.parentSpan;

    if (skipTracingResult.skip || shouldBeBypassed(skipTracingResult.parentSpan, options)) {
      let traceLevelHeaderHasBeenAdded = false;
      if (skipTracingResult.suppressed) {
        traceLevelHeaderHasBeenAdded = tryToAddTraceLevelAddHeaderToOpts(options, '0', w3cTraceContext);
      }

      clientRequest = originalRequest.apply(coreModule, arguments);
      if (skipTracingResult.suppressed && !traceLevelHeaderHasBeenAdded) {
        clientRequest.setHeader(constants.traceLevelHeaderName, '0');
        setW3cHeadersOnRequest(clientRequest, w3cTraceContext);
      }

      return clientRequest;
    }

    cls.ns.run(() => {
      // NOTE: Check for parentSpan existence, because of allowRootExitSpan is being enabled
      const span = cls.startSpan({
        spanName: 'node.http.client',
        kind: constants.EXIT,
        traceId: parentSpan?.t,
        parentSpanId: parentSpan?.s
      });

      // startSpan updates the W3C trace context and writes it back to CLS, so we have to refetch the updated context
      // object from CLS.
      w3cTraceContext = cls.getW3cTraceContext();

      let completeCallUrl;
      let params;
      if (urlArg && typeof urlArg === 'string') {
        // just one string....
        completeCallUrl = sanitizeUrl(urlArg);
        params = splitAndFilter(urlArg);
      } else if (urlArg && isUrlObject(urlArg)) {
        completeCallUrl = sanitizeUrl(url.format(urlArg));
        params = dropLeadingQuestionMark(filterParams(urlArg.search));
      } else if (options) {
        const urlAndQuery = constructFromUrlOpts(options, coreModule, forceHttps);
        completeCallUrl = urlAndQuery[0];
        params = urlAndQuery[1];
      }

      span.stack = tracingUtil.getStackTrace(request);

      const boundCallback = cls.ns.bind(function boundCallback(res) {
        span.data.http = {
          method: clientRequest.method,
          url: completeCallUrl,
          status: res.statusCode,
          params
        };

        const headers = captureRequestHeaders(options, clientRequest, res);
        if (headers) {
          span.data.http.header = headers;
        }

        span.d = Date.now() - span.ts;
        span.ec = res.statusCode >= 500 ? 1 : 0;
        span.transmit();

        if (callback) {
          callback(res);
        }
      });

      if (callbackIndex >= 0) {
        originalArgs[callbackIndex] = boundCallback;
      } else {
        originalArgs.push(boundCallback);
      }

      let instanaHeadersHaveBeenAdded = false;
      try {
        instanaHeadersHaveBeenAdded = tryToAddHeadersToOpts(options, span, w3cTraceContext);
        clientRequest = originalRequest.apply(coreModule, originalArgs);
      } catch (e) {
        // A synchronous exception indicates a failure that is not covered by the listeners. Using a malformed URL for
        // example is a case that triggers a synchronous exception.
        span.data.http = {
          url: completeCallUrl,
          error: e ? e.message : ''
        };
        span.d = Date.now() - span.ts;
        span.ec = 1;
        span.transmit();
        throw e;
      }

      cls.ns.bindEmitter(clientRequest);
      if (!instanaHeadersHaveBeenAdded) {
        instanaHeadersHaveBeenAdded = setHeadersOnRequest(clientRequest, span, w3cTraceContext);
      }

      let isTimeout = false;
      clientRequest.on('timeout', () => {
        // From the Node.js HTTP client documentation:
        //
        //  > Emitted when the underlying socket times out from inactivity. This **only notifies** that the socket
        //  > has been idle. **The request must be aborted manually.**
        //
        // This means that the timeout event is only an indication that something is wrong. After the timeout occurred,
        // a well behaved client will do one of two things:
        //
        // 1) Abort the request via req.abort(). This will result in a "socket hang up" error event being emitted by
        //    the request.
        // 2) The request continues as normal and the timeout is ignored. In this case, we could end up either in a
        //    success or in an error state. This is most likely unintentional HTTP client behavior.
        //
        // On top of this, commonly used HTTP client libraries add additional timeout capabilities based on wall clock
        // time on top of Node.js' timeout capabilities (which typically end in an abort() call).
        isTimeout = true;
      });

      clientRequest.on('error', err => {
        let errorMessage = err.message || err.code;

        if (isTimeout) {
          errorMessage = 'Timeout exceeded';

          if (clientRequest.aborted) {
            errorMessage += ', request aborted';
          }
        } else if (clientRequest.aborted) {
          errorMessage = 'Request aborted';
        }
        span.data.http = {
          method: clientRequest.method,
          url: completeCallUrl,
          error: errorMessage
        };
        span.d = Date.now() - span.ts;
        span.ec = 1;
        span.transmit();
      });
    });
    return clientRequest;
  };

  coreModule.get = function get() {
    const req = coreModule.request.apply(coreModule, arguments);
    req.end();
    return req;
  };
}

function constructFromUrlOpts(options, self, forceHttps) {
  if (options.href) {
    return [sanitizeUrl(options.href), splitAndFilter(options.href)];
  }

  try {
    const agent = options.agent || self.agent;
    const port = options.port || options.defaultPort || (agent && agent.defaultPort) || 80;
    const protocol =
      (port === 443 && 'https:') ||
      options.protocol ||
      (agent && agent.protocol) ||
      (forceHttps && 'https:') ||
      'http:';
    const host = options.hostname || options.host || 'localhost';
    const path = options.path || '/';
    return [sanitizeUrl(`${protocol}//${host}:${port}${path}`), splitAndFilter(path)];
  } catch (e) {
    return [undefined, undefined];
  }
}

function isUrlObject(argument) {
  return URL && argument instanceof url.URL;
}

function tryToAddHeadersToOpts(options, span, w3cTraceContext) {
  // Some HTTP spec background: If the request has a header Expect: 100-continue, the client will first send the
  // request headers, without the body. The client is then ought to wait for the server to send a first, preliminary
  // response with the status code 100 Continue (if all is well). Only then will the client send the actual request
  // body.

  // The Node.js HTTP client core module implements this in the following way: If the option's object given to the
  // `http(s).request` contains "Expect": "100-continue", it will immediately flush the headers and send them internally
  // via `send(''). That is, when `http.request(...)` returns, the headers have already been sent and can no longer be
  // modified. The client code is expected to not call `request.setHeaders` on that request. Usually the client code
  // will listen for the request to emit the 'continue' event (signalling that the server has sent "100 Continue") and
  // only then write the response body to the request, for example by calling `request.end(body)`.

  // Thus, at the very least, when this header is present in the incoming request options arguments, we need to add our
  // INSTANA-... HTTP headers to options.headers instead of calling request.setHeader later. In fact, we opt for the
  // slightly more general solution: If there is an options object parameter with a `headers` object, we just always
  // add our headers there. We use request.setHeader on the ClientRequest object only when the headers object is missing
  // (see setHeadersOnRequest).

  if (hasHeadersOption(options)) {
    if (!isItSafeToModifiyHeadersInOptions(options)) {
      return true;
    }
    options.headers[constants.spanIdHeaderName] = span.s;
    options.headers[constants.traceIdHeaderName] = span.t;
    options.headers[constants.traceLevelHeaderName] = '1';
    tryToAddW3cHeaderToOpts(options, w3cTraceContext);
    return true;
  }

  return false;
}

function tryToAddTraceLevelAddHeaderToOpts(options, level, w3cTraceContext) {
  if (hasHeadersOption(options)) {
    if (!isItSafeToModifiyHeadersInOptions(options)) {
      // Return true to convince the caller that headers have been added although we have in fact not added them. This
      // will result in no headers being added. See isItSafeToModifiyHeadersInOptions for the motivation behind this.
      return true;
    }
    options.headers[constants.traceLevelHeaderName] = level;
    tryToAddW3cHeaderToOpts(options, w3cTraceContext);
    return true;
  }
  return false;
}

function tryToAddW3cHeaderToOpts(options, w3cTraceContext) {
  if (w3cTraceContext) {
    options.headers[constants.w3cTraceParent] = w3cTraceContext.renderTraceParent();
    if (w3cTraceContext.hasTraceState()) {
      options.headers[constants.w3cTraceState] = w3cTraceContext.renderTraceState();
    }
  }
}

function hasHeadersOption(options) {
  return options && typeof options === 'object' && options.headers && typeof options.headers === 'object';
}

function setHeadersOnRequest(clientRequest, span, w3cTraceContext) {
  if (!isItSafeToModifiyHeadersForRequest(clientRequest)) {
    return;
  }
  clientRequest.setHeader(constants.spanIdHeaderName, span.s);
  clientRequest.setHeader(constants.traceIdHeaderName, span.t);
  clientRequest.setHeader(constants.traceLevelHeaderName, '1');
  setW3cHeadersOnRequest(clientRequest, w3cTraceContext);
}

function setW3cHeadersOnRequest(clientRequest, w3cTraceContext) {
  if (w3cTraceContext) {
    clientRequest.setHeader(constants.w3cTraceParent, w3cTraceContext.renderTraceParent());
    if (w3cTraceContext.hasTraceState()) {
      clientRequest.setHeader(constants.w3cTraceState, w3cTraceContext.renderTraceState());
    }
  }
}

function isItSafeToModifiyHeadersInOptions(options) {
  const keys = Object.keys(options.headers);
  let key;
  for (let i = 0; i < keys.length; i++) {
    key = keys[i];
    if (
      'authorization' === key.toLowerCase() &&
      typeof options.headers[key] === 'string' &&
      options.headers[key].indexOf('AWS') === 0
    ) {
      // This is a signed AWS API request (probably from the aws-sdk package).
      // Adding our headers too this request would trigger a SignatureDoesNotMatch error in case the request will be
      // retried:
      // "SignatureDoesNotMatch: The request signature we calculated does not match the signature you provided.
      // Check your key and signing method."
      // See https://docs.aws.amazon.com/general/latest/gr/signing_aws_api_requests.html
      //
      // Additionally, adding our headers to this request would not have any benefit - the receiving end will be an AWS
      // service like S3 and those are not instrumented. (There is a very small chance that the receiving end is an
      // instrumented Lambda function behind an API gateway and the user is using
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/APIGateway.html to invoke this Gateway/Lambda
      // combination, which _would_ benefit from tracing headers.)
      return false;
    }
  }
  return true;
}

function isItSafeToModifiyHeadersForRequest(clientRequest) {
  const authHeader = clientRequest.getHeader('Authorization');
  // see comment in isItSafeToModifiyHeadersInOptions
  return !authHeader || authHeader.indexOf('AWS') !== 0;
}

function captureRequestHeaders(options, clientRequest, response) {
  let headers = getExtraHeadersFromOptions(options, extraHttpHeadersToCapture);
  headers = mergeExtraHeadersFromServerResponseOrClientRequest(headers, clientRequest, extraHttpHeadersToCapture);
  headers = mergeExtraHeadersFromIncomingMessage(headers, response, extraHttpHeadersToCapture);
  return headers;
}
