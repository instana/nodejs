'use strict';

var coreHttpModule = require('http');

var discardUrlParameters = require('../../util/url').discardUrlParameters;
var tracingConstants = require('../constants');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var shimmer = require('shimmer')
var cls = require('../cls');

var originalRequest = coreHttpModule.request;

var log = require('../../logger');
var logger = log.getLogger('cls');

var isActive = false;

exports.init = function () {
  shimmer.wrap(coreHttpModule, 'request', fn => function (options, callback) {
    if (!isActive) {
      return fn(options, cls.stanStorage.bind(callback));
    }

    var ret = null;
    cls.stanStorage.run(() => {
      var context = cls.createContext();
      context.containsExitSpan = true;

      var completeCallUrl;
      if (typeof(options) === 'string') {
        completeCallUrl = discardUrlParameters(options);
      } else {
        completeCallUrl = constructCompleteUrlFromOpts(options, coreHttpModule);
      }

      var span = {
        s: tracingUtil.generateRandomSpanId(),
        t: context.traceId,
        p: context.parentSpanId,
        f: tracingUtil.getFrom(),
        async: false,
        error: false,
        ec: 0,
        ts: Date.now(),
        d: 0,
        n: 'node.http.client',
        // stack: tracingUtil.getStackTrace(request),
        data: null
      };
      context.spanId = span.s;

      options.headers[tracingConstants.spanIdHeaderName] = span.s;
      options.headers[tracingConstants.traceIdHeaderName] = span.t;
      options.headers[tracingConstants.traceLevelHeaderName] = '1';

      var responseListener = function(res) {
        logger.info('inside response listener');
        span.data = {
          http: {
            method: ret.method,
            url: completeCallUrl,
            status: res.statusCode
          }
        };
        span.d = Date.now() - span.ts;
        span.error = res.statusCode >= 500;
        span.ec = span.error ? 1 : 0;
        transmission.addSpan(span);

        if (callback) {
          callback(res);
        }
      };

      try {
        ret = fn(options, responseListener);
      } catch (e) {
        // synchronous exceptions normally indicate failures that are not covered by the
        // listeners. Cleanup immediately.
        logger.info('error caught: %j', e);
        throw e;
      }

      ret.addListener('timeout', function() {
        logger.info('inside timeout listener')
        span.data = {
          http: {
            method: ret.method,
            url: completeCallUrl,
            error: 'Timeout exceeded'
          }
        };
        span.d = Date.now() - span.ts;
        span.error = true;
        span.ec = 1;
        transmission.addSpan(span);
      });

      ret.addListener('error', function(err) {
        logger.info('inside error listener: %j', err)

        span.data = {
          http: {
            method: ret.method,
            url: completeCallUrl,
            error: err.message
          }
        };
        span.d = Date.now() - span.ts;
        span.error = true;
        span.ec = 1;
        transmission.addSpan(span);
      });
    });
    return ret;
  });
};


// exports.init = function() {
//   coreHttpModule.request = function request(opts, givenResponseListener) {
//
//     var tracingSuppressed = context.tracingSuppressed;
//     var traceId = context.traceId;
//     var clientRequest;
//
//     if (!isActive || tracingSuppressed || context.containsExitSpan || traceId == null) {
//       clientRequest = originalRequest.apply(coreHttpModule, arguments);
//
//       if (tracingSuppressed) {
//         clientRequest.setHeader(tracingConstants.traceLevelHeaderName, '0');
//       }
//
//       return clientRequest;
//     }
//     return clientRequest;
//   };
// };


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

    // copy of logic from
    // https://github.com/nodejs/node/blob/master/lib/_http_client.js
    // to support incomplete options with agent specific defaults.
    var protocol = options.protocol || (agent && agent.protocol) || 'http:';
    var port = options.port || options.defaultPort || (agent && agent.defaultPort) || 80;
    var host = options.hostname || options.host || 'localhost';
    var path = options.path || '/';
    return discardUrlParameters(protocol + '//' + host + ':' + port + path);
  } catch (e) {
    return undefined;
  }
}
