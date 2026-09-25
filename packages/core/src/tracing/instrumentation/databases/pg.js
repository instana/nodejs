/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');
const dbBindVariablesUtil = require('../../dbBindVariablesUtil');

let isActive = false;

/** @type {import('../../../config').InstanaConfig['tracing']['dbBindVariables']} */
let dbBindVariablesConfig;

exports.spanName = 'postgres';
exports.batchable = true;

exports.init = function init(config) {
  dbBindVariablesConfig = config && config.tracing && config.tracing.dbBindVariables;
  hook.onModuleLoad('pg', instrumentPg);
};

function instrumentPg(pg) {
  instrumentClient(pg.Client);
}

function instrumentClient(Client) {
  shimmer.wrap(Client.prototype, 'query', shimQuery);
}

function shimQuery(original) {
  return function () {
    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    // slightly more performant version of the usual Array.prototype.slice trick.
    const argsForOriginalQuery = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      argsForOriginalQuery[i] = arguments[i];
    }
    return instrumentedQuery(this, original, argsForOriginalQuery);
  };
}

function instrumentedQuery(ctx, originalQuery, argsForOriginalQuery) {
  const host = ctx.connectionParameters.host;
  const port = ctx.connectionParameters.port;
  const user = ctx.connectionParameters.user;
  const db = ctx.connectionParameters.database;

  const config = argsForOriginalQuery[0];

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT
    });
    span.stack = tracingUtil.getStackTrace(instrumentedQuery);

    const sql = typeof config === 'string' ? config : config.text;

    span.data.pg = {
      stmt: tracingUtil.shortenDatabaseStatement(sql),
      host,
      port,
      user,
      db
    };

    const binds = captureBinds(sql, config, argsForOriginalQuery);
    if (binds !== null) {
      span.data.pg.binds = binds;
    }

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
      return originalQuery.apply(ctx, argsForOriginalQuery);
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
    } else {
      tracingUtil.handleUnexpectedReturnValue(promise, exports.spanName, 'query');
      finishSpan(null, span);
    }
    return promise;
  });
}

/**
 * Captures bind variables for a pg query using the shared dbBindVariablesUtil.
 *
 * pg only supports PostgreSQL-style positional parameters ($1, $2, ...).
 * Column names are resolved by parsing the SQL statement.
 *
 * @param {string} sql
 * @param {string | { text: string, values?: any[] }} config
 * @param {any[]} argsForOriginalQuery
 * @returns {Array<{ name: string, value: string }> | null}
 */
function captureBinds(sql, config, argsForOriginalQuery) {
  if (!dbBindVariablesUtil.isActive(dbBindVariablesConfig)) {
    return null;
  }

  // Collect the raw positional values from the pg API
  let rawValues;
  if (typeof config === 'string') {
    if (argsForOriginalQuery.length > 1 && Array.isArray(argsForOriginalQuery[1])) {
      rawValues = argsForOriginalQuery[1];
    }
  } else if (config && Array.isArray(config.values)) {
    rawValues = config.values;
  }

  if (!rawValues || rawValues.length === 0) {
    return null;
  }

  const columnNames = dbBindVariablesUtil.resolveColumnNamesDollarParams(sql, rawValues.length);
  return dbBindVariablesUtil.buildBindsFromPositional(rawValues, columnNames, dbBindVariablesConfig.allowedColumns);
}

function finishSpan(error, span) {
  if (error) {
    span.ec = 1;
    tracingUtil.setErrorDetails(span, error, 'pg');
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
