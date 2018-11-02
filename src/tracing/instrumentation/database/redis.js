'use strict';

var commands = require('redis-commands');
var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var tracingUtil = require('../../tracingUtil');
var cls = require('../../cls');

var isActive = false;

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};

exports.init = function() {
  requireHook.onModuleLoad('redis', instrument);
};

function instrument(redis) {
  var redisClientProto = redis.RedisClient.prototype;
  commands.list.forEach(function(name) {
    // some commands are not added or are renamed. Ignore them for now.
    if (
      !redisClientProto[name] &&
      // multi commands are handled differently
      name !== 'multi'
    ) {
      return;
    }

    var boundInstrumentCommand = instrumentCommand.bind(null, name);
    shimmer.wrap(redisClientProto, name, boundInstrumentCommand);
    shimmer.wrap(redisClientProto, name.toUpperCase(), boundInstrumentCommand);
  });

  if (redis.Multi) {
    shimmer.wrap(redis.Multi.prototype, 'exec_transaction', instrumentMultiExec.bind(null, true));

    var instrumentedBatch = instrumentMultiExec.bind(null, false);
    shimmer.wrap(redis.Multi.prototype, 'exec_batch', instrumentedBatch);
    shimmer.wrap(redis.Multi.prototype, 'EXEC', instrumentedBatch);
    shimmer.wrap(redis.Multi.prototype, 'exec', instrumentedBatch);
  }
}

function instrumentCommand(command, original) {
  return function wrappedCommand() {
    var client = this;

    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      return original.apply(this, arguments);
    }

    var span = cls.startSpan('redis', cls.EXIT);
    // do not set the redis span as the current span
    cls.setCurrentSpan(parentSpan);
    span.stack = tracingUtil.getStackTrace(wrappedCommand);
    span.data = {
      redis: {
        connection: client.address,
        command: command
      }
    };

    var callback = cls.ns.bind(onResult);
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    var userProvidedCallback = args[args.length - 1];
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
        span.error = true;
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
    var multi = this;

    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      return original.apply(this, arguments);
    }

    var span = cls.startSpan('redis', cls.EXIT);
    // do not set the redis span as the current span
    cls.setCurrentSpan(parentSpan);
    span.stack = tracingUtil.getStackTrace(instrumentedMultiExec);
    span.data = {
      redis: {
        connection: multi._client.address,
        command: isAtomic ? 'multi' : 'pipeline'
      }
    };

    var callback = cls.ns.bind(onResult);
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    var userProvidedCallback = args[args.length - 1];
    if (typeof userProvidedCallback !== 'function') {
      userProvidedCallback = null;
      args.push(callback);
    } else {
      args[args.length - 1] = callback;
    }

    var subCommands = (span.data.redis.subCommands = []);
    var len = multi.queue.length;
    for (i = 0; i < len; i++) {
      var subCommand = multi.queue.get(i);
      subCommands[i] = subCommand.command;
      subCommand.callback = buildSubCommandCallback(span, subCommand.callback);
    }
    // must not send batch size 0
    if (subCommands.length > 0) {
      span.b = {
        s: subCommands.length,
        u: false
      };
    }
    span.ec = 0;
    span.error = false;

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
      span.error = true;

      if (!span.data.redis.error) {
        span.data.redis.error = tracingUtil.getErrorDetails(err);
      }
    }

    if (typeof userProvidedCallback === 'function') {
      userProvidedCallback.apply(this, arguments);
    }
  };
}
