/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.spanName = 'postgres';
exports.batchable = true;

exports.init = function init() {
  requireHook.onModuleLoad('pg', instrumentPg);
};

function instrumentPg(pg) {
  instrumentClient(pg.Client);
}

function instrumentClient(Client) {
  shimmer.wrap(Client.prototype, 'query', shimQuery);
}

function shimQuery(original) {
  return function () {
    if (isActive && cls.isTracing()) {
      // slightly more performant version of the usual Array.prototype.slice trick.
      const argsForOriginalQuery = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        argsForOriginalQuery[i] = arguments[i];
      }
      return instrumentedQuery(this, original, argsForOriginalQuery);
    }
    return original.apply(this, arguments);
  };
}

function instrumentedQuery(ctx, originalQuery, argsForOriginalQuery) {
  const parentSpan = cls.getCurrentSpan();

  if (constants.isExitSpan(parentSpan)) {
    return originalQuery.apply(ctx, argsForOriginalQuery);
  }

  const host = ctx.connectionParameters.host;
  const port = ctx.connectionParameters.port;
  const user = ctx.connectionParameters.user;
  const db = ctx.connectionParameters.database;

  const config = argsForOriginalQuery[0];

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedQuery);
    span.data.pg = {
      stmt: tracingUtil.shortenDatabaseStatement(typeof config === 'string' ? config : config.text),
      host,
      port,
      user,
      db
    };

    let originalCallback;
    let callbackIndex = -1;
    for (let i = 1; i < argsForOriginalQuery.length; i++) {
      if (typeof argsForOriginalQuery[i] === 'function') {
        originalCallback = argsForOriginalQuery[i];
        callbackIndex = i;
        break;
      }
    }

    if (callbackIndex >= 0) {
      const wrappedCallback = function (error) {
        finishSpan(error, span);
        return originalCallback.apply(this, arguments);
      };
      argsForOriginalQuery[callbackIndex] = cls.ns.bind(wrappedCallback);
    }

    const promise = originalQuery.apply(ctx, argsForOriginalQuery);
    if (promise && typeof promise.then === 'function') {
      promise
        .then(value => {
          finishSpan(null, span);
          return value;
        })
        .catch(error => {
          finishSpan(error, span);
          return error;
        });
    }
    return promise;
  });
}

function finishSpan(error, span) {
  if (error) {
    span.ec = 1;
    span.data.pg.error = tracingUtil.getErrorDetails(error);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
