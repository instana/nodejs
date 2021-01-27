/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const commands = require('redis-commands');
const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let isActive = false;

exports.spanName = 'redis';
exports.batchable = true;

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

exports.init = function init() {
  requireHook.onModuleLoad('redis', instrument);
};

function instrument(redis) {
  const redisClientProto = redis.RedisClient.prototype;
  commands.list.forEach(name => {
    // some commands are not added or are renamed. Ignore them for now.
    if (
      !redisClientProto[name] &&
      // multi commands are handled differently
      name !== 'multi'
    ) {
      return;
    }

    const boundInstrumentCommand = instrumentCommand.bind(null, name);
    shimmer.wrap(redisClientProto, name, boundInstrumentCommand);
    shimmer.wrap(redisClientProto, name.toUpperCase(), boundInstrumentCommand);
  });

  if (redis.Multi) {
    if (typeof redis.Multi.prototype.exec_transaction === 'function') {
      // Very old redis versions (0.10.x) like the one used by a particular edgemicro plug-in (volos-quota-redis) do not
      // have the exec_transaction method. Shimming this conditionally is not really necessary (shimmer checks for
      // itself) but supresses a log statement from shimmer.
      shimmer.wrap(redis.Multi.prototype, 'exec_transaction', instrumentMultiExec.bind(null, true));
    }

    const instrumentedBatch = instrumentMultiExec.bind(null, false);
    if (typeof redis.Multi.prototype.exec_batch === 'function') {
      // Old versions of redis also do not have exec_batch. See above (exec_transaction).
      shimmer.wrap(redis.Multi.prototype, 'exec_batch', instrumentedBatch);
    }
    shimmer.wrap(redis.Multi.prototype, 'EXEC', instrumentedBatch);
    shimmer.wrap(redis.Multi.prototype, 'exec', instrumentedBatch);
  }
}

function instrumentCommand(command, original) {
  return function wrappedCommand() {
    const client = this;

    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const parentSpan = cls.getCurrentSpan();
    if (constants.isExitSpan(parentSpan)) {
      return original.apply(this, arguments);
    }

    const span = cls.startSpan(exports.spanName, constants.EXIT);
    // do not set the redis span as the current span
    cls.setCurrentSpan(parentSpan);
    span.stack = tracingUtil.getStackTrace(wrappedCommand);
    span.data.redis = {
      connection: client.address,
      command
    };

    const callback = cls.ns.bind(onResult);
    const args = [];
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    let userProvidedCallback = args[args.length - 1];
    if (typeof userProvidedCallback !== 'function') {
      userProvidedCallback = null;
      args.push(callback);
    } else {
      args[args.length - 1] = callback;
    }

    return original.apply(this, args);

    function onResult(error) {
      span.d = Date.now() - span.ts;

      if (error) {
        span.ec = 1;
        span.data.redis.error = tracingUtil.getErrorDetails(error);
      }

      span.transmit();

      if (typeof userProvidedCallback === 'function') {
        return userProvidedCallback.apply(this, arguments);
      }
    }
  };
}

function instrumentMultiExec(isAtomic, original) {
  return function instrumentedMultiExec() {
    const multi = this;

    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    const parentSpan = cls.getCurrentSpan();
    if (constants.isExitSpan(parentSpan)) {
      return original.apply(this, arguments);
    }

    const span = cls.startSpan(exports.spanName, constants.EXIT);
    // do not set the redis span as the current span
    cls.setCurrentSpan(parentSpan);
    span.stack = tracingUtil.getStackTrace(instrumentedMultiExec);
    span.data.redis = {
      connection: multi._client.address,
      command: isAtomic ? 'multi' : 'pipeline'
    };

    const callback = cls.ns.bind(onResult);
    const args = [];
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    let userProvidedCallback = args[args.length - 1];
    if (typeof userProvidedCallback !== 'function') {
      userProvidedCallback = null;
      args.push(callback);
    } else {
      args[args.length - 1] = callback;
    }

    const subCommands = (span.data.redis.subCommands = []);
    const len = multi.queue.length;
    for (let i = 0; i < len; i++) {
      const subCommand = multi.queue.get(i);
      subCommands[i] = subCommand.command;
      subCommand.callback = buildSubCommandCallback(span, subCommand.callback);
    }
    // must not send batch size 0
    if (subCommands.length > 0) {
      span.b = {
        s: subCommands.length
      };
    }
    span.ec = 0;

    return original.apply(this, args);

    function onResult(error) {
      span.d = Date.now() - span.ts;

      if (error && isAtomic) {
        span.ec = span.data.redis.subCommands.length;
      }

      span.transmit();

      if (typeof userProvidedCallback === 'function') {
        return userProvidedCallback.apply(this, arguments);
      }
    }
  };
}

function buildSubCommandCallback(span, userProvidedCallback) {
  return function subCommandCallback(err) {
    if (err) {
      span.ec++;

      if (!span.data.redis.error) {
        span.data.redis.error = tracingUtil.getErrorDetails(err);
      }
    }

    if (typeof userProvidedCallback === 'function') {
      userProvidedCallback.apply(this, arguments);
    }
  };
}
