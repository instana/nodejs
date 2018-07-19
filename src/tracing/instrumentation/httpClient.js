'use strict';

var coreHttpModule = require('http');
var coreHttpsModule = require('https');

var discardUrlParameters = require('../../util/url').discardUrlParameters;
var tracingConstants = require('../constants');
var tracingUtil = require('../tracingUtil');
var httpCommon = require('./_http');
var cls = require('../cls');

var isActive = false;

exports.init = function() {
  instrument(coreHttpModule);
  instrument(coreHttpsModule);
};

function instrument(coreModule) {
  var originalRequest = coreModule.request;
  coreModule.request = function request(opts, givenResponseListener) {
    var clientRequest;

    if (!isActive || !cls.isTracing()) {
      clientRequest = originalRequest.call(coreModule, opts, givenResponseListener);
      if (cls.tracingLevel()) {
        clientRequest.setHeader(tracingConstants.traceLevelHeaderName, cls.tracingLevel());
      }
      return clientRequest;
    }

    var parentSpan = cls.getCurrentSpan();

    if (cls.isExitSpan(parentSpan)) {
      clientRequest = originalRequest.call(coreModule, opts, givenResponseListener);

      if (cls.tracingSuppressed()) {
        clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '0');
      }
      return clientRequest;
    }

    cls.ns.run(function() {
      var span = cls.startSpan('node.http.client');

      var completeCallUrl;
      if (typeof opts === 'string') {
        completeCallUrl = discardUrlParameters(opts);
      } else {
        completeCallUrl = constructCompleteUrlFromOpts(opts, coreModule);
      }

      span.stack = tracingUtil.getStackTrace(request);

      var responseListener = cls.ns.bind(function responseListener(res) {
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

        if (givenResponseListener) {
          givenResponseListener(res);
        }
      });

      try {
        clientRequest = originalRequest.call(coreModule, opts, responseListener);
      } catch (e) {
        // synchronous exceptions normally indicate failures that are not covered by the
        // listeners. Cleanup immediately.
        throw e;
      }

      cls.ns.bindEmitter(clientRequest);
      clientRequest.setHeader(tracingConstants.spanIdHeaderName, span.s);
      clientRequest.setHeader(tracingConstants.traceIdHeaderName, span.t);
      clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '1');

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
