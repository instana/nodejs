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
    const createClientWrap = originalCreatedClientFn => {
      return function instrumentedCreateClientInstana(createClientOpts) {
        const redisClient = originalCreatedClientFn.apply(this, arguments);
        let addressUrl;

        // https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
        if (createClientOpts) {
          if (createClientOpts.url) {
            addressUrl = createClientOpts.url;
          } else if (createClientOpts.socket) {
            if (createClientOpts.socket.host) {
              addressUrl = `${createClientOpts.socket.host}:${createClientOpts.socket.port}`;
            } else if (createClientOpts.socket.path) {
              addressUrl = createClientOpts.socket.path;
            }
          } else if (createClientOpts.host) {
            addressUrl = createClientOpts.host;
          }
        } else {
          // default fallback, see https://github.com/redis/node-redis#basic-example
          addressUrl = 'localhost:6379';
        }

        shimAllCommands(redisClient, addressUrl, false, redisCommandList);

        if (redisClient.multi) {
          const wrapMulti = originalMultiFn => {
            return function instrumentedMultiInstana() {
              const result = originalMultiFn.apply(this, arguments);
              const selfMadeQueue = [];

              // batch
              const wrapExecAsPipeline = execAsPipelineOriginalFn => {
                return function instrumentedExecAsPipelineInstana() {
                  return instrumentMultiExec(
                    this,
                    arguments,
                    execAsPipelineOriginalFn,
                    addressUrl,
                    false,
                    false,
                    selfMadeQueue
                  );
                };
              };

              // multi
              const wrapExec = execOriginalFn => {
                return function instrumentedExecAsPipelineInstana() {
                  return instrumentMultiExec(this, arguments, execOriginalFn, addressUrl, true, false, selfMadeQueue);
                };
              };

              const wrapAddCommand = addCommandOriginalFn => {
                return function instrumentedAddCommandInstana() {
                  selfMadeQueue.push(arguments[0]);
                  return addCommandOriginalFn.apply(this, arguments);
                };
              };

              // NOTE: addCommand will fill our self made queue to know how many
              // operations landed in this multi transaction. We are unable to access
              // redis internal queue anymore.
              shimmer.wrap(result, 'addCommand', wrapAddCommand);
              shimmer.wrap(result, 'exec', wrapExec);

              // `execAsPipeline` can be used to trigger batches in 4.x
              shimmer.wrap(result, 'execAsPipeline', wrapExecAsPipeline);

              return result;
            };
          };

          shimmer.wrap(redisClient, 'multi', wrapMulti);
        }

        return redisClient;
      };
    };

    shimmer.wrap(redis, 'createClient', createClientWrap);
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
      const wrapExec = isAtomic => {
        return function wrapExecInstana(originalFn) {
          return function instrumentedExecInstana() {
            const addressUrl = this._client ? this._client.address : null;
            return instrumentMultiExec(this, arguments, originalFn, addressUrl, isAtomic, true, this.queue);
          };
        };
      };

      if (typeof redis.Multi.prototype.exec_transaction === 'function') {
        shimmer.wrap(redis.Multi.prototype, 'exec_transaction', wrapExec(true));
      }

      if (typeof redis.Multi.prototype.exec_batch === 'function') {
        shimmer.wrap(redis.Multi.prototype, 'exec_batch', wrapExec(false));
      }

      if (typeof redis.Multi.prototype.EXEC === 'function') {
        shimmer.wrap(redis.Multi.prototype, 'EXEC', wrapExec(false));
      }

      // 0.x multi and 3.x batch use `exec` but we need to differeniate if batch or multi
      if (typeof redis.Multi.prototype.exec === 'function') {
        if (typeof redis.Multi.prototype.exec_transaction !== 'function') {
          shimmer.wrap(redis.Multi.prototype, 'exec', wrapExec(true));
        } else {
          shimmer.wrap(redis.Multi.prototype, 'exec', wrapExec(false));
        }
      }
    }
  }
}

function shimAllCommands(redisClass, addressUrl, cbStyle, redisCommands) {
  let list = redisCommands;

  if (!list || !list.length) {
    // v0, v3 legacy
    // from https://github.com/NodeRedis/redis-commands/blob/master/commands.json
    list = require('./redis-commands.json');
  }

  const wrapCommand = commandName => {
    return function wrapCommandInstana(original) {
      return instrumentCommand(original, commandName, addressUrl, cbStyle);
    };
  };

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

    shimmer.wrap(redisClass, name, wrapCommand(name));

    const upperCaseFnName = name.toUpperCase();
    if (redisClass[upperCaseFnName]) shimmer.wrap(redisClass, upperCaseFnName, wrapCommand(name));
  });
}

function instrumentCommand(original, command, address, cbStyle) {
  return function instrumentedCommandInstana() {
    const origCtx = this;
    const origArgs = arguments;

    if (cls.skipExitTracing({ isActive })) {
      return original.apply(origCtx, origArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.stack = tracingUtil.getStackTrace(instrumentCommand);

      span.data.redis = {
        connection: address || origCtx.address,
        command
      };

      let userProvidedCallback;

      if (cbStyle) {
        const modifiedArgs = [];
        for (let i = 0; i < origArgs.length; i++) {
          modifiedArgs[i] = origArgs[i];
        }

        // CASE: no callback provided
        //       e.g. client.set('key', 'value') is valid without callback
        //       e.g. client.get('key') is valid without callback
        // NOTE: multi & batch is not handled via instrumentCommand
        const callback = cls.ns.bind(onResult);
        userProvidedCallback = modifiedArgs[modifiedArgs.length - 1];

        if (typeof userProvidedCallback !== 'function') {
          userProvidedCallback = null;
          modifiedArgs.push(callback);
          return original.apply(origCtx, modifiedArgs);
        } else {
          modifiedArgs[modifiedArgs.length - 1] = callback;
          return original.apply(origCtx, modifiedArgs);
        }
      } else {
        const promise = original.apply(origCtx, origArgs);
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

function instrumentMultiExec(origCtx, origArgs, original, address, isAtomic, cbStyle, queue) {
  if (cls.skipExitTracing({ isActive })) {
    return original.apply(origCtx, origArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan(exports.spanName, constants.EXIT, parentSpan.t, parentSpan.s);
    span.stack = tracingUtil.getStackTrace(instrumentMultiExec);
    span.data.redis = {
      connection: address,
      // pipeline = batch
      command: isAtomic ? 'multi' : 'pipeline'
    };

    const subCommands = (span.data.redis.subCommands = []);
    let legacyMultiMarkerHasBeenSeen = false;
    const len = queue.length;

    for (let i = 0; i < len; i++) {
      let subCommand;

      // v3
      if (typeof queue.get === 'function') {
        subCommand = queue.get(i);
        subCommands[i] = subCommand.command;

        // CASE: a batch can succeed although an individual command failed
        if (!isAtomic) {
          subCommand.callback = buildSubCommandCallback(span, subCommand.callback);
        }
      } else {
        // v0, v4
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

    const modifiedArgs = [];
    for (let i = 0; i < origArgs.length; i++) {
      modifiedArgs[i] = origArgs[i];
    }

    let userProvidedCallback;

    if (cbStyle) {
      const callback = cls.ns.bind(onResult);

      userProvidedCallback = modifiedArgs[modifiedArgs.length - 1];
      if (typeof userProvidedCallback !== 'function') {
        userProvidedCallback = null;
        modifiedArgs.push(callback);
      } else {
        modifiedArgs[modifiedArgs.length - 1] = callback;
      }

      return original.apply(origCtx, modifiedArgs);
    } else {
      try {
        const promise = original.apply(origCtx, modifiedArgs);

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

      // NOTE: if customer is using batching, there won't be an error object
      if (err) {
        span.ec = 1;

        if (err.message) {
          span.data.redis.error = err.message;
        } else if (err instanceof Array && err.length) {
          span.data.redis.error = err[0].message;
        } else {
          span.data.redis.error = 'Unknown error';
        }

        // v3 = provides sub errors
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
}

// NOTE: We only need this function to capture errors in a batch command
//       The fn is only used for v3 redis client
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
