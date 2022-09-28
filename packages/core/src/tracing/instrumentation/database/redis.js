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
  // v4 commands, "redis-commands" is outdated and no longer compatible with it
  requireHook.onFileLoad(/\/@redis\/client\/dist\/lib\/cluster\/commands.js/, captureCommands);
  requireHook.onModuleLoad('redis', instrument);
};

let redisCommandList = [];
function captureCommands(file) {
  if (file && file.default) {
    redisCommandList = Object.keys(file.default);
  }
}

function instrument(redis) {
  // NOTE: v4 no longer exposes the RedisClient. We need to wait till `createClient` get's called
  //       to get the instance of the redis client
  if (!redis.RedisClient) {
    const createdClientWrap = originalFunction => {
      return function instrumentedCreateClientInstana(address) {
        const redisClient = originalFunction.apply(this, arguments);
        let addressUrl;

        if (address && address.url) {
          addressUrl = address.url;
        }

        shimAllCommands(redisClient, addressUrl, false);

        if (redisClient.multi) {
          const wrapMulti = orig => {
            return function instrumentedMultiInstana() {
              const result = orig.apply(this, arguments);
              const selfMadeQueue = [];

              const wrapExecAsPipeline = execAsPipelineOrig => {
                return function instrumentedExecAsPipelineInstana() {
                  return instrumentMultiExec(false, addressUrl, false, execAsPipelineOrig)(selfMadeQueue, this);
                };
              };

              const wrapExec = execOrig => {
                return async function instrumentedExecInstana() {
                  return instrumentMultiExec(true, addressUrl, false, execOrig)(selfMadeQueue, this);
                };
              };

              const wrapAddCommand = addCommandOrig => {
                return function instrumentedAddCommandInstana() {
                  selfMadeQueue.push(arguments[0]);
                  return addCommandOrig.apply(this, arguments);
                };
              };

              // NOTE: addCommand will fill our self made queue to know how many
              // operations landed in this multi transaction. We are unable to access
              // redis internal queue anymore.
              shimmer.wrap(result, 'addCommand', wrapAddCommand);
              shimmer.wrap(result, 'exec', wrapExec);

              // `execAsPipeline` can be used to trigger batches in v4
              shimmer.wrap(result, 'execAsPipeline', wrapExecAsPipeline);

              return result;
            };
          };

          shimmer.wrap(redisClient, 'multi', wrapMulti);
        }

        return redisClient;
      };
    };

    shimmer.wrap(redis, 'createClient', createdClientWrap);
  } else {
    const redisClientProto = redis.RedisClient.prototype;

    shimAllCommands(redisClientProto, false, true);

    // Batch === Individual commands fail and the whole batch executation will NOT fail
    // Multi === Individual commands fail and the whole multi executation will fail
    // Different version of redis (in particular ancient ones like 0.10.x) have rather different APIs for the multi
    // operations. Shimming them conditionally is not really necessary (shimmer checks for itself) but supresses a log
    // statement from shimmer.
    // 0.x => multi (https://github.com/redis/node-redis/blob/v0.12.1/index.js#L1105) exec
    // 0.x => no batch
    // eslint-disable-next-line max-len
    // 3.x => multi(https://github.com/redis/node-redis/blob/v3.1.2/lib/individualCommands.js#L24) exec = exec_transaction
    // 3.x => batch(https://github.com/redis/node-redis/blob/v3.1.2/lib/individualCommands.js#L31) exec = exec_batch
    if (redis.Multi) {
      const instrumentedAsMulti = instrumentMultiExec.bind(null, true, null, true);
      const instrumentedAsBatch = instrumentMultiExec.bind(null, false, null, true);

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
}

function shimAllCommands(redisClass, addressUrl, cbStyle) {
  let list = commands.list;
  if (redisCommandList.length) {
    list = redisCommandList;
  }

  list.forEach(name => {
    // NOTE: Some commands are not added or are renamed. Ignore them.
    //       Do not use & connector, because if the fn multi is defined,
    ///      we still don't want to handle it here. Needs to be a OR condition
    if (
      !redisClass[name] ||
      // Multi commands are handled differently.
      name === 'multi'
    ) {
      return;
    }

    const boundInstrumentCommand = instrumentCommand.bind(null, name, addressUrl, cbStyle);
    shimmer.wrap(redisClass, name, boundInstrumentCommand);

    const upperCaseFnName = name.toUpperCase();
    if (redisClass[upperCaseFnName]) shimmer.wrap(redisClass, upperCaseFnName, boundInstrumentCommand);
  });
}

function instrumentCommand(command, address, cbStyle, original) {
  return function wrappedCommand() {
    const client = this;

    if (cls.skipExitTracing({ isActive })) {
      return original.apply(this, arguments);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.stack = tracingUtil.getStackTrace(wrappedCommand);

      span.data.redis = {
        connection: address || client.address,
        command
      };

      const args = [];
      for (let i = 0; i < arguments.length; i++) {
        args[i] = arguments[i];
      }

      let userProvidedCallback;

      if (cbStyle) {
        // CASE: no callback provided
        //       e.g. client.set('key', 'value') is valid without callback
        //       e.g. client.get('key') is valid without callback
        // NOTE: multi & batch is not handled via instrumentCommand
        const callback = cls.ns.bind(onResult);
        userProvidedCallback = args[args.length - 1];

        if (typeof userProvidedCallback !== 'function') {
          userProvidedCallback = null;
          args.push(callback);
          return original.apply(this, args);
        } else {
          args[args.length - 1] = callback;
          return original.apply(this, args);
        }
      } else {
        const promise = original.apply(this, args);
        if (typeof promise.then === 'function') {
          promise
            .then(value => {
              onResult();
              return value;
            })
            .catch(error => {
              onResult(error);
              return error;
            });
        }
        return promise;
      }

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

function instrumentMultiExec(isAtomic, address, cbStyle, original) {
  return function instrumentedMultiExec(selfMadeQueue, ctx) {
    const multi = this;

    if (cls.skipExitTracing({ isActive })) {
      return original.apply(ctx || this, arguments);
    }

    const parentSpan = cls.getCurrentSpan();

    return cls.ns.runAndReturn(() => {
      let connection;
      if (multi && multi._client) {
        connection = multi._client.address;
      } else {
        connection = address;
      }

      const span = cls.startSpan(exports.spanName, constants.EXIT, parentSpan.t, parentSpan.s);
      span.stack = tracingUtil.getStackTrace(instrumentedMultiExec);
      span.data.redis = {
        connection,
        // pipeline = batch
        command: isAtomic ? 'multi' : 'pipeline'
      };

      let queue;
      const subCommands = (span.data.redis.subCommands = []);
      let legacyMultiMarkerHasBeenSeen = false;

      if (multi && multi.queue) {
        queue = multi.queue;
      } else if (selfMadeQueue) {
        queue = selfMadeQueue;
      } else {
        queue = [];
      }

      const len = queue.length;

      for (let i = 0; i < len; i++) {
        let subCommand;
        if (typeof queue.get === 'function') {
          subCommand = multi.queue.get(i);
          subCommands[i] = subCommand.command;

          // CASE: a batch can succeed although an individual command failed
          if (!isAtomic) {
            subCommand.callback = buildSubCommandCallback(span, subCommand.callback);
          }
        } else {
          // NOTE: Remove in 3.x
          // Branch for ancient versions of redis (like 0.12.1):
          subCommand = queue[i];
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

      const args = [];
      for (let i = 0; i < arguments.length; i++) {
        args[i] = arguments[i];
      }

      let userProvidedCallback;

      if (cbStyle) {
        const callback = cls.ns.bind(onResult);

        userProvidedCallback = args[args.length - 1];
        if (typeof userProvidedCallback !== 'function') {
          userProvidedCallback = null;
          args.push(callback);
        } else {
          args[args.length - 1] = callback;
        }

        return original.apply(this, args);
      } else {
        try {
          const promise = original.apply(ctx, args);
          if (typeof promise.then === 'function') {
            promise
              .then(value => {
                onResult();
                return value;
              })
              .catch(error => {
                onResult(error);
                return error;
              });
          }

          return promise;
        } catch (execSycnErr) {
          onResult(execSycnErr);
          throw execSycnErr;
        }
      }

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

          // NOTE: sub errors are only supported in 3.x
          if (err.errors && err.errors.length) {
            span.data.redis.error = err.errors.map(subErr => subErr.message).join('\n');
          }
        }

        // v4 batch has no feature to pass callbacks to sub commands
        if (err && !span.data.redis.error) {
          span.ec = 1;
          span.data.redis.error = err.message;
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
