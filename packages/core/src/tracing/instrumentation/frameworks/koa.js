/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const shimmer = require('shimmer');

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
  requireHook.onModuleLoad('koa-router', instrumentRouter);
};

function instrumentRouter(Router) {
  shimmer.wrap(Router.prototype, 'routes', shimRoutes);
}

function shimRoutes(originalFunction) {
  return function () {
    return instrumentedRoutes(this, originalFunction, arguments);
  };
}

function instrumentedRoutes(thisContext, originalRoutes, originalArgs) {
  // We need to hook into the dispatch function, which does not exist on Router.prototype but is created on the fly in
  // Router.routes, so we need to hook into Router.routes to get access to the dispatch function.
  const dispatch = originalRoutes.apply(thisContext, originalArgs);

  // Actually, we could just use ctx._matchedRoute, which would be the path template we are looking for and which gets
  // set by koa-router. Unfortunately, this is broken, see
  // https://github.com/ZijianHe/koa-router/issues/478 and
  // https://github.com/ZijianHe/koa-router/issues/444.

  // eslint-disable-next-line no-unused-vars
  const instrumentedDispatch = function (ctx, next) {
    if (active && cls.isTracing()) {
      const dispatchResult = dispatch.apply(this, arguments);
      return dispatchResult.then(resolvedValue => {
        if (ctx.matched && ctx.matched.length && ctx.matched.length > 0) {
          const matchedRouteLayers = ctx.matched.slice();
          matchedRouteLayers.sort(byLeastSpecificLayer);
          const mostSpecificPath = normalizeLayerPath(matchedRouteLayers[matchedRouteLayers.length - 1].path);
          annotateHttpEntrySpanWithPathTemplate(mostSpecificPath);
        }
        return resolvedValue;
      });
    } else {
      return dispatch.apply(this, arguments);
    }
  };

  // The router attaches itself as a property to the dispatch function and other methods in koa-router rely on this, so
  // we need to attach this property to our dispatch function, too.
  instrumentedDispatch.router = dispatch.router;
  return instrumentedDispatch;
}

/**
 * Copied from
 * https://github.com/ZijianHe/koa-router/pull/475, which would fix the mentioned issues with ctx._matchedRoute (if
 * it got merged).
 *
 * Sort function for array of Layers. Will sort the layers with least specific first
 * and most specific last.
 *
 * @param {Layer} a
 * @param {Layer} b
 */
function byLeastSpecificLayer(a, b) {
  const regexpA = a.path && typeof a.path === 'object';
  const regexpB = b.path && typeof b.path === 'object';
  let pathA = normalizeLayerPath(a.path);
  let pathB = normalizeLayerPath(b.path);
  const wildA = pathA.endsWith('(.*)');
  const wildB = pathB.endsWith('(.*)');
  if (wildA && wildB) return pathA.length - pathB.length;
  pathA = wildA ? pathA.slice(0, -4) : pathA;
  pathB = wildB ? pathB.slice(0, -4) : pathB;
  if (pathA !== pathB) {
    if (pathA.startsWith(pathB)) return 1;
    if (pathB.startsWith(pathA)) return -1;
  }
  if (wildA) return -1;
  if (wildB) return 1;
  if (regexpA && !regexpB) {
    return -1;
  }
  if (!regexpA && regexpB) {
    return 1;
  }
  return 0;
}

function normalizeLayerPath(p) {
  if (p == null) {
    return '';
  }
  if (typeof p === 'object') {
    return p.toString();
  }
  return p;
}

function annotateHttpEntrySpanWithPathTemplate(pathTemplate) {
  const span = cls.getCurrentEntrySpan();
  if (!span || span.n !== httpServer.spanName || span.pathTplFrozen) {
    return;
  }
  span.data.http.path_tpl = pathTemplate;
}
