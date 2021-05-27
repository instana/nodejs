/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const httpServer = require('../protocols/httpServer');
const cls = require('../../cls');

let logger;
logger = require('../../../logger').getLogger('tracing/hapi', newLogger => {
  logger = newLogger;
});

let isActive = false;

exports.init = function init() {
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
  return function () {
    if (!isActive || !cls.isTracing()) {
      return originalFunction.apply(this, arguments);
    }
    const routeObject = originalFunction.apply(this, arguments);
    annotateHttpEntrySpanWithPathTemplate(routeObject);
    return routeObject;
  };
}

function annotateHttpEntrySpanWithPathTemplate(routeObject) {
  if (routeObject == null || !routeObject.route || typeof routeObject.route.path !== 'string') {
    return;
  }
  const span = cls.getCurrentEntrySpan();
  if (!span || span.n !== httpServer.spanName || span.pathTplFrozen) {
    return;
  }
  span.data.http.path_tpl = routeObject.route.path;
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
