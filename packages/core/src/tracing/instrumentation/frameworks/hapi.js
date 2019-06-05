'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var httpServer = require('../protocols/httpServer');
var cls = require('../../cls');

var logger;
logger = require('../../../logger').getLogger('tracing/hapi', function(newLogger) {
  logger = newLogger;
});

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('@hapi/call', instrumentHapiCall);
};

function instrumentHapiCall(hapiCall) {
  if (!hapiCall.Router || !hapiCall.Router.prototype) {
    logger.warn(
      'Found @hapi/call module, but it does not export a Router value. Hapi will not be instrumented, calls processed' +
        ' by Hapi will not have a path template.'
    );
    return;
  }
  shimmer.wrap(hapiCall.Router.prototype, 'route', shimRoute);
}

function shimRoute(originalFunction) {
  return function() {
    if (!isActive || !cls.isTracing()) {
      return originalFunction.apply(this, arguments);
    }
    var routeObject = originalFunction.apply(this, arguments);
    annotateHttpEntrySpanWithPathTemplate(routeObject);
    return routeObject;
  };
}

function annotateHttpEntrySpanWithPathTemplate(routeObject) {
  if (routeObject == null || !routeObject.route || typeof routeObject.route.path !== 'string') {
    return;
  }
  var span = cls.getCurrentRootSpan();
  if (!span || span.n !== httpServer.spanName) {
    return;
  }
  span.data.http.path_tpl = routeObject.route.path;
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
