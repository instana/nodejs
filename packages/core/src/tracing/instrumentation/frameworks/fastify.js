/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const requireHook = require('../../../util/requireHook');
const httpServer = require('../protocols/httpServer');
const cls = require('../../cls');

let active = false;

exports.activate = function activate() {
  active = true;
};

exports.deactivate = function deactivate() {
  active = false;
};

exports.init = function init() {
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
  Object.keys(build).forEach(k => {
    overwrittenBuild[k] = build[k];
  });

  return overwrittenBuild;

  function overwrittenBuild() {
    const app = build.apply(this, arguments);

    if (app.route) {
      const originalRoute = app.route;
      app.route = function shimmedRoute(opts) {
        if (opts.handler) {
          const originalHandler = opts.handler;
          opts.handler = function shimmedHandler() {
            annotateHttpEntrySpanWithPathTemplate(app, opts);
            return originalHandler.apply(this, arguments);
          };
        }

        let preHandler;
        let preHandlerKey;
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

  const span = cls.getCurrentEntrySpan();
  if (!span || span.n !== httpServer.spanName || span.pathTplFrozen) {
    return;
  }

  const basePathDescriptor = Object.getOwnPropertyDescriptor(app, 'basePath');
  const basePathOrPrefix = basePathDescriptor && basePathDescriptor.get ? app.prefix : app.basePath;
  span.data.http.path_tpl = (basePathOrPrefix || '') + (opts.url || opts.path || '/');
}
