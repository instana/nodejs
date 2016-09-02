'use strict';

var createSlidingWindow = require('../slidingWindow').create;

// we can configure the window to be at most 2s long, but we will normally
// be polling values every second from the windows and clear them manually.
var windowCalculations = {};
var payload = {};

exports.payloadPrefix = 'http';

Object.defineProperty(exports, 'currentPayload', {
  get: function() {
    for (var key in windowCalculations) {
      if (windowCalculations.hasOwnProperty(key)) {
        windowCalculations[key]();
      }
    }
    return payload;
  }
});

exports.activate = function() {};
exports.deactivate = function() {};

instrumentHttpModule('http');
instrumentHttpModule('https');


function instrumentHttpModule(httpModuleName) {
  var coreHttpModule = require(httpModuleName);
  var originalCreateServer = coreHttpModule.createServer;

  coreHttpModule.createServer = function createServer() {
    var server = originalCreateServer.apply(coreHttpModule, arguments);
    var payloadContext = {
      type: httpModuleName
    };
    var key;

    var numberOfRequestsWindow = createSlidingWindow({duration: 1000});
    var numberOfResponsesSendWindow = createSlidingWindow({duration: 1000});
    var responseTimeWindow = createSlidingWindow({duration: 1000});

    server.on('request', function(req, res) {
      var start = Date.now();
      numberOfRequestsWindow.addPoint(1);

      res.on('finish', function() {
        responseTimeWindow.addPoint(Date.now() - start);
        numberOfResponsesSendWindow.addPoint(1);
      });
    });

    server.on('listening', function() {
      payloadContext.address = server.address();
      key = payloadContext.address.address + payloadContext.address.port;
      exports.currentPayload[key] = payloadContext;
      windowCalculations[key] = calculateWindows;
    });

    server.on('close', function() {
      delete exports.currentPayload[key];
      delete windowCalculations[key];
    });

    return server;

    function calculateWindows() {
      payloadContext.requests = numberOfRequestsWindow.sum();
      payloadContext.responses = numberOfResponsesSendWindow.sum();

      var percentiles = responseTimeWindow.getPercentiles([0.5, 0.9, 0.95, 0.99]);
      payloadContext.responseTime50 = percentiles[0];
      payloadContext.responseTime90 = percentiles[1];
      payloadContext.responseTime95 = percentiles[2];
      payloadContext.responseTime99 = percentiles[3];

      numberOfRequestsWindow.clear();
      numberOfResponsesSendWindow.clear();
      responseTimeWindow.clear();
    }
  };
}
