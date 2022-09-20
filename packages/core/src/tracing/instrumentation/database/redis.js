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

let logger;
logger = require('../../../logger').getLogger('tracing/redis', newLogger => {
  logger = newLogger;
});

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
  if (!redis.RedisClient) {
    logger.debug('Aborting the attempt to instrument redis, this seems to be an unsupported version of redis.');
    return;
  }
  const redisClientProto = redis.RedisClient.prototype;
  commands.list.forEach(name => {
    // Some commands are not added or are renamed. Ignore them.
    if (
      !redisClientProto[name] &&
      // Multi commands are handled differently.
      name !== 'multi'
    ) {
      return;
    }

    const boundInstrumentCommand = instrumentCommand.bind(null, name);
    shimmer.wrap(redisClientProto, name, boundInstrumentCommand);
    shimmer.wrap(redisClientProto, name.toUpperCase(), boundInstrumentCommand);
  });

  if (redis.Multi) {
    // Different version of redis (in particular ancient ones like 0.10.x) have rather different APIs for the multi
    // operations. Shimming them conditionally is not really necessary (shimmer checks for itself) but supresses a log
    // statement from shimmer.

    if (typeof redis.Multi.prototype.exec_transaction === 'function') {
      shimmer.wrap(redis.Multi.prototype, 'exec_transaction', instrumentMultiExec.bind(null, true));
    }

    const instrumentedBatch = instrumentMultiExec.bind(null, false);
    if (typeof redis.Multi.prototype.exec_batch === 'function') {
      // Old versions of redis also do not have exec_batch. See above (exec_transaction).
      shimmer.wrap(redis.Multi.prototype, 'exec_batch', instrumentedBatch);
    }
    if (typeof redis.Multi.prototype.EXEC === 'function') {
      shimmer.wrap(redis.Multi.prototype, 'EXEC', instrumentedBatch);
    }
    if (typeof redis.Multi.prototype.exec === 'function') {
      shimmer.wrap(redis.Multi.prototype, 'exec', instrumentedBatch);
    }
  }
}

function instrumentCommand(command, original) {
  return function wrappedCommand() {
    const client = this;

    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(exports.spanName, constants.EXIT);
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
    });
  };
}

function instrumentMultiExec(isAtomic, original) {
  return function instrumentedMultiExec() {
    const multi = this;

    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    // CASE: multi = multiple executions
    //       These executations are combined in one batch (see test).
    //       And all of them need to same parent.
    //       This parent has to be the incoming http server span.
    //       If parentSpan.n is "redis", we need to use the original entry span instead. (http server)
    //       because `cls.getCurrentSpan()` is the previous redis execution of the multi executions.
    let parentSpan = cls.getCurrentSpan();
    if (parentSpan.n === 'redis') {
      parentSpan = cls.getCurrentEntrySpan();
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(exports.spanName, constants.EXIT, parentSpan.t, parentSpan.s);

      span.stack = tracingUtil.getStackTrace(instrumentedMultiExec);
      span.data.redis = {
        connection: multi._client != null ? multi._client.address : undefined,
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
      const len = multi.queue != null ? multi.queue.length : 0;
      let legacyMultiMarkerHasBeenSeen = false;
      for (let i = 0; i < len; i++) {
        let subCommand;
        if (typeof multi.queue.get === 'function') {
          subCommand = multi.queue.get(i);
          subCommands[i] = subCommand.command;
          subCommand.callback = buildSubCommandCallback(span, subCommand.callback);
        } else {
          // Branch for ancient versions of redis (like 0.12.1):
          subCommand = multi.queue[i];
          if (!Array.isArray(subCommand) || subCommand.length === 0) {
            continue;
          }
          if (subCommand[0] === 'MULTI') {
            legacyMultiMarkerHasBeenSeen = true;
            continue;
          }
          const idx = legacyMultiMarkerHasBeenSeen && i >= 1 ? i - 1 : i;
          subCommands[idx] = subCommand[0];
        }
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
    });
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
