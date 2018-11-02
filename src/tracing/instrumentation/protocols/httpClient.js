'use strict';

var coreHttpModule = require('http');
var coreHttpsModule = require('https');

var semver = require('semver');
var URL = require('url').URL;

var discardUrlParameters = require('../../../util/url').discardUrlParameters;
var tracingConstants = require('../../constants');
var tracingUtil = require('../../tracingUtil');
var httpCommon = require('./_http');
var cls = require('../../cls');
var url = require('url');

var isActive = false;

exports.init = function() {
  instrument(coreHttpModule);

  // Up until Node 8, the core https module uses the http module internally, so https calls are traced automatically
  // without instrumenting https. Beginning with Node 9, the core https module started to use the internal core module
  // _http_client directly rather than going through the http module. Therefore, beginning with Node 9, explicit
  // instrumentation of the core https module is required. OTOH, in Node <= 8, we must _not_ instrument https, as
  // otherwise we would run our instrumentation code twice (once for https.request and once for http.request).
  if (semver.gte(process.versions.node, '9.0.0')) {
    instrument(coreHttpsModule);
  }
};

function instrument(coreModule) {
  var originalRequest = coreModule.request;
  coreModule.request = function request() {
    var clientRequest;

    // When http.request is called with http.request(options, undefined) (happens with request-promise, for example),
    // arguments.length will still be 2 but there is no callback. Even though we push a callback into the arguments
    // array, this cb will then be at index 2, thus never get called in older versions of Node, hence the span would
    // not be finished/transmitted. We normalize the args by removing undefined/null from the end.
    while (arguments.length > 0 && arguments[arguments.length - 1] == null) {
      arguments.length--;
    }
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }

    var urlArg = null;
    var options = null;
    var callback = null;
    var callbackIndex = -1;

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

    if (!isActive || !cls.isTracing()) {
      var traceLevelHeaderHasBeenAdded = false;
      if (cls.tracingLevel()) {
        traceLevelHeaderHasBeenAdded = tryToAddTraceLevelAddHeaderToOpts(options, cls.tracingLevel());
      }
      clientRequest = originalRequest.apply(coreModule, arguments);
      if (cls.tracingLevel() && !traceLevelHeaderHasBeenAdded) {
        clientRequest.setHeader(tracingConstants.traceLevelHeaderName, cls.tracingLevel());
      }
      return clientRequest;
    }

    var parentSpan = cls.getCurrentSpan();

    if (cls.isExitSpan(parentSpan)) {
      if (cls.tracingSuppressed()) {
        traceLevelHeaderHasBeenAdded = tryToAddTraceLevelAddHeaderToOpts(options, '0');
      }
      clientRequest = originalRequest.apply(coreModule, arguments);
      if (cls.tracingSuppressed() && !traceLevelHeaderHasBeenAdded) {
        clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '0');
      }
      return clientRequest;
    }

    cls.ns.run(function() {
      var span = cls.startSpan('node.http.client', cls.EXIT);

      var completeCallUrl;
      if (urlArg && typeof urlArg === 'string') {
        completeCallUrl = discardUrlParameters(urlArg);
      } else if (urlArg && isUrlObject(urlArg)) {
        completeCallUrl = discardUrlParameters(url.format(urlArg));
      } else if (options) {
        completeCallUrl = constructCompleteUrlFromOpts(options, coreModule);
      }

      span.stack = tracingUtil.getStackTrace(request);

      var boundCallback = cls.ns.bind(function boundCallback(res) {
        span.data = {
          http: {
            method: clientRequest.method,
            url: completeCallUrl,
            status: res.statusCode,
            header: httpCommon.getExtraHeaders(res)
          }
        };
        span.d = Date.now() - span.ts;
        span.error = res.statusCode >= 500;
        span.ec = span.error ? 1 : 0;
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

      try {
        var instanaHeadersHaveBeenAdded = tryToAddHeadersToOpts(options, span);
        clientRequest = originalRequest.apply(coreModule, originalArgs);
      } catch (e) {
        // synchronous exceptions normally indicate failures that are not covered by the
        // listeners. Cleanup immediately.
        throw e;
      }

      cls.ns.bindEmitter(clientRequest);
      if (!instanaHeadersHaveBeenAdded) {
        instanaHeadersHaveBeenAdded = setHeadersOnRequest(clientRequest, span);
      }

      var isTimeout = false;
      clientRequest.on('timeout', function() {
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

      clientRequest.on('error', function(err) {
        var errorMessage = err.message;
        if (isTimeout) {
          errorMessage = 'Timeout exceeded';

          if (clientRequest.aborted) {
            errorMessage += ', request aborted';
          }
        } else if (clientRequest.aborted) {
          errorMessage = 'Request aborted';
        }
        span.data = {
          http: {
            method: clientRequest.method,
            url: completeCallUrl,
            error: errorMessage
          }
        };
        span.d = Date.now() - span.ts;
        span.error = true;
        span.ec = 1;
        span.transmit();
      });
    });
    return clientRequest;
  };

  coreModule.get = function get() {
    var req = coreModule.request.apply(coreModule, arguments);
    req.end();
    return req;
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};

function constructCompleteUrlFromOpts(options, self) {
  if (options.href) {
    return discardUrlParameters(options.href);
  }

  try {
    var agent = options.agent || self.agent;
    var port = options.port || options.defaultPort || (agent && agent.defaultPort) || 80;
    var protocol = (port === 443 && 'https:') || options.protocol || (agent && agent.protocol) || 'http:';
    var host = options.hostname || options.host || 'localhost';
    var path = options.path || '/';
    return discardUrlParameters(protocol + '//' + host + ':' + port + path);
  } catch (e) {
    return undefined;
  }
}

function isUrlObject(argument) {
  return URL && argument instanceof url.URL;
}

function tryToAddHeadersToOpts(options, span) {
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
  // add our headers there. Only when this object is missing do we use request.setHeader on the ClientRequest object
  // (see setHeadersOnRequest).
  if (hasHeadersOption(options)) {
    options.headers[tracingConstants.spanIdHeaderName] = span.s;
    options.headers[tracingConstants.traceIdHeaderName] = span.t;
    options.headers[tracingConstants.traceLevelHeaderName] = '1';
    return true;
  }
  return false;
}

function tryToAddTraceLevelAddHeaderToOpts(options, level) {
  if (hasHeadersOption(options)) {
    options.headers[tracingConstants.traceLevelHeaderName] = level;
    return true;
  }
  return false;
}

function hasHeadersOption(options) {
  return options && typeof options === 'object' && options.headers && typeof options.headers === 'object';
}

function setHeadersOnRequest(clientRequest, span) {
  clientRequest.setHeader(tracingConstants.spanIdHeaderName, span.s);
  clientRequest.setHeader(tracingConstants.traceIdHeaderName, span.t);
  clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '1');
  return true;
}
