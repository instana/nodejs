/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../cls');
const { EXIT, isExitSpan } = require('../../constants');
const tracingUtil = require('../../tracingUtil');

const shimmer = require('shimmer');
const requireHook = require('../../../util/requireHook');
const { getFunctionArguments } = require('../../../util/function_arguments');

const operationsInfo = {
  add: 'add',
  set: 'set',
  append: 'append',
  prepend: 'prepend',
  touch: 'touch',
  replace: 'replace',
  cas: 'cas',
  incr: 'incr',
  decr: 'decr',
  get: 'get',
  getMulti: 'getMulti',
  gets: 'gets',
  del: 'delete',
  delete: 'delete'
};

const SPAN_NAME = 'memcached';

let isActive = false;

exports.isActive = function () {
  return isActive;
};

exports.init = function init() {
  requireHook.onModuleLoad('memcached', instrumentMemcached);
};

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function instrumentMemcached(Memcached) {
  shimmer.wrap(Memcached.prototype, 'command', shimCommand);
}

function shimCommand(originalCommand) {
  return function () {
    if (isActive) {
      const originalArgs = getFunctionArguments(arguments);
      return instrumentedCommand(this, originalCommand, originalArgs);
    }

    return originalCommand.apply(this, arguments);
  };
}

function instrumentedCommand(ctx, originalCommand, originaCommandArgs) {
  const parentSpan = cls.getCurrentSpan();

  if (!parentSpan || isExitSpan(parentSpan)) {
    return originalCommand.apply(ctx, originaCommandArgs);
  }

  return cls.ns.runAndReturn(() => {
    const originalQuery = originaCommandArgs[0];

    const span = cls.startSpan(SPAN_NAME, EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedCommand);

    originaCommandArgs[0] = cls.ns.bind(function () {
      const originalQueryArgs = getFunctionArguments(arguments);
      const queryResult = originalQuery.apply(this, originalQueryArgs);

      const originalCallback = queryResult.callback;

      queryResult.callback = cls.ns.bind(function () {
        const originalCallbackArgs = getFunctionArguments(arguments);
        const err = originalCallbackArgs[0];
        // originalCallbackArgs[1] = some result. eg: true, false, the value of the key

        span.data[SPAN_NAME] = buildSpanData(queryResult, ctx.servers);

        finishSpan(err, span);
        return originalCallback.apply(this, originalCallbackArgs);
      });

      return queryResult;
    });

    return originalCommand.apply(ctx, originaCommandArgs);
  });
}

function buildSpanData(queryResult, connections) {
  const { type, key, multi } = queryResult;

  let op = type;

  if (multi && type === 'get') {
    op = 'getMulti';
  }

  const validOperation = operationsInfo[op];

  const data = {
    key: Array.isArray(key) ? key.join(', ') : key,
    // This may be an issue if the customer sets more than one connection, but our UI expects always only one
    // So we pick always the first one in the list
    connection: connections[0]
  };

  if (validOperation) {
    data.operation = validOperation;
  }
  return data;
}

function finishSpan(err, span) {
  if (err) {
    addErrorToSpan(err, span);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    const spanData = span.data && span.data[SPAN_NAME];
    if (spanData) {
      spanData.error = err.message || err.code || JSON.stringify(err);
    }
  }
}
