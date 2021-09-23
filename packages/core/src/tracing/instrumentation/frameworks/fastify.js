/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const requireHook = require('../../../util/requireHook');
const httpServer = require('../protocols/httpServer');
const cls = require('../../cls');
let logger = require('../../../logger').getLogger('tracing/fastify', newLogger => {
  logger = newLogger;
});

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

/**
 * We register a custom hook and capture data we need for
 * our span.
 *
 * See https://www.fastify.io/docs/latest/Hooks
 */
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

    // NOTE: all major versions support `addHook` - this is just a safe protection
    if (!app.addHook) {
      logger.warn('Instana was not able to instrument Fastify.');
      return app;
    }

    app.addHook('onRequest', function onRequest(request, reply, done) {
      try {
        // NOTE: v1 uses _context https://github.com/fastify/fastify/blob/1.x/fastify.js#L276
        //       v2/v3 uses context https://github.com/fastify/fastify/blob/2.x/test/handler-context.test.js#L41
        const url = reply._context ? reply._context.config.url : reply.context.config.url;

        annotateHttpEntrySpanWithPathTemplate(app, { url });
      } catch (err) {
        logger.warn('Instana was not able to retrieve path template.');
      }

      done();
    });

    return app;
  }
}

/**
 * Fastify is auto instrumend by our http server instrumention.
 * But on top of that we want to capture the original registered template path.
 *
 * A request comes in GET /foo/22
 * We want to trace GET /foo/:id
 */
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
