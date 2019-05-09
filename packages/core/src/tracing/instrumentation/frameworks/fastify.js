'use strict';

var requireHook = require('../../../util/requireHook');
var httpServer = require('../protocols/httpServer');
var cls = require('../../cls');

var active = false;

exports.activate = function() {
  active = true;
};

exports.deactivate = function() {
  active = false;
};

exports.init = function() {
  requireHook.onModuleLoad('fastify', instrument);
};

// Fastify exposes a function as its module's export. We are replacing
// this exposed function so that we gain access to the created fastify
// object. This is necessary so that we can overwrite the fastify.route
// method. fastify.route is the central routing registration method to
// which all other functions delegate.
//
// We overwrite fastify.route so that we can wrap users's request
// handlers. During request handler execution time, we can identify the
// full path template.
function instrument(build) {
  if (typeof build !== 'function') {
    return build;
  }

  // copy further exported properties
  Object.keys(build).forEach(function(k) {
    overwrittenBuild[k] = build[k];
  });

  return overwrittenBuild;

  function overwrittenBuild() {
    var app = build.apply(this, arguments);

    if (app.route) {
      var originalRoute = app.route;
      app.route = function shimmedRoute(opts) {
        if (opts.handler) {
          var originalHandler = opts.handler;
          opts.handler = function shimmedHandler() {
            annotateHttpEntrySpanWithPathTemplate(app, opts);
            return originalHandler.apply(this, arguments);
          };
        }

        var preHandler;
        var preHandlerKey;
        if (opts.preHandler) {
          // In Fastify 2.x, the attribute is called preHandler.
          preHandler = opts.preHandler;
          preHandlerKey = 'preHandler';
        } else if (opts.beforeHandler) {
          // In Fastify 1.x, the attribute is called beforeHandler.
          preHandler = opts.beforeHandler;
          preHandlerKey = 'beforeHandler';
        }

        if (preHandler) {
          if (typeof preHandler === 'function') {
            opts[preHandlerKey] = function shimmedPreHandler() {
              annotateHttpEntrySpanWithPathTemplate(app, opts);
              return preHandler.apply(this, arguments);
            };
          } else if (Array.isArray(preHandler)) {
            opts[preHandlerKey].unshift(function prependedBeforeHandler(request, reply, done) {
              annotateHttpEntrySpanWithPathTemplate(app, opts);
              done();
            });
          }
        }

        return originalRoute.apply(this, arguments);
      };
    }

    return app;
  }
}

function annotateHttpEntrySpanWithPathTemplate(app, opts) {
  if (!active) {
    return;
  }

  var span = cls.getCurrentRootSpan();
  if (!span || span.n !== httpServer.spanName) {
    return;
  }

  span.data.http.path_tpl = (app.basePath || '') + (opts.url || opts.path || '/');
}
