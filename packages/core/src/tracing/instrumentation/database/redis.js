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
    // NOTE: Some commands are not added or are renamed. Ignore them.
    //       Do not use & connector, because if the fn multi is defined,
    ///      we still don't want to handle it here. Needs to be a OR condition
    if (
      !redisClientProto[name] ||
      // Multi commands are handled differently.
      name === 'multi'
    ) {
      return;
    }

    const boundInstrumentCommand = instrumentCommand.bind(null, name);
    shimmer.wrap(redisClientProto, name, boundInstrumentCommand);
    shimmer.wrap(redisClientProto, name.toUpperCase(), boundInstrumentCommand);
  });

  // Batch === Individual commands fail and the whole batch executation will NOT fail
  // Multi === Individual commands fail and the whole multi executation will fail
  // Different version of redis (in particular ancient ones like 0.10.x) have rather different APIs for the multi
  // operations. Shimming them conditionally is not really necessary (shimmer checks for itself) but supresses a log
  // statement from shimmer.
  // 0.x => multi (https://github.com/redis/node-redis/blob/v0.12.1/index.js#L1105) exec
  // 0.x => no batch
  // 3.x => multi(https://github.com/redis/node-redis/blob/v3.1.2/lib/individualCommands.js#L24) exec = exec_transaction
  // 3.x => batch(https://github.com/redis/node-redis/blob/v3.1.2/lib/individualCommands.js#L31) exec = exec_batch
  if (redis.Multi) {
    const instrumentedAsMulti = instrumentMultiExec.bind(null, true);
    const instrumentedAsBatch = instrumentMultiExec.bind(null, false);

    if (typeof redis.Multi.prototype.exec_transaction === 'function') {
      shimmer.wrap(redis.Multi.prototype, 'exec_transaction', instrumentedAsMulti);
    }
    if (typeof redis.Multi.prototype.exec_batch === 'function') {
      shimmer.wrap(redis.Multi.prototype, 'exec_batch', instrumentedAsBatch);
    }
    if (typeof redis.Multi.prototype.EXEC === 'function') {
      shimmer.wrap(redis.Multi.prototype, 'EXEC', instrumentedAsBatch);
    }

    // 0.x multi and 3.x batch use `exec` but we need to differeniate if batch or multi
    if (typeof redis.Multi.prototype.exec === 'function') {
      if (typeof redis.Multi.prototype.exec_transaction !== 'function') {
        shimmer.wrap(redis.Multi.prototype, 'exec', instrumentedAsMulti);
      } else {
        shimmer.wrap(redis.Multi.prototype, 'exec', instrumentedAsBatch);
      }
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

      const args = [];
      for (let i = 0; i < arguments.length; i++) {
        args[i] = arguments[i];
      }

      // CASE: no callback provided
      //       e.g. client.set('key', 'value') is valid without callback
      //       e.g. client.get('key') is valid without callback
      // NOTE: multi & batch is not handled via instrumentCommand
      const callback = cls.ns.bind(onResult);
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

    const parentSpan = cls.getCurrentSpan();

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(exports.spanName, constants.EXIT, parentSpan.t, parentSpan.s);
      span.stack = tracingUtil.getStackTrace(instrumentedMultiExec);
      span.data.redis = {
        connection: multi._client != null ? multi._client.address : undefined,
        // pipeline = batch
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

          // CASE: a batch can succeed although an individual command failed
          if (!isAtomic) {
            subCommand.callback = buildSubCommandCallback(span, subCommand.callback);
          }
        } else {
          // NOTE: Remove in 3.x
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

      function onResult(err) {
        span.d = Date.now() - span.ts;

        if (err && isAtomic) {
          span.ec = 1;

          if (err.message) {
            span.data.redis.error = err.message;
          } else if (err instanceof Array && err.length) {
            span.data.redis.error = err[0].message;
          } else {
            span.data.redis.error = 'Unknown error';
          }

          // NOTE: sub errors are not supported in 0.12
          if (err.errors && err.errors.length) {
            span.data.redis.error = err.errors.map(subErr => subErr.message).join('\n');
          }
        }

        span.transmit();

        if (typeof userProvidedCallback === 'function') {
          return userProvidedCallback.apply(this, arguments);
        }
      }
    });
  };
}

// NOTE: We only need this function to capture errors in a batch command
// 3.x offers the ability to read the errors as sub errors (sub error = sub command)
// and 0.x has no batch functionality
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
