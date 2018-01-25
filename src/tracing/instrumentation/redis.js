'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};

exports.init = function() {
  requireHook.on('redis', instrument);
  requireHook.on('ioredis', instrumentIoredis);
};


function instrument(redis) {
  shimmer.wrap(redis.RedisClient.prototype, 'internal_send_command', instrumentNodeRedisSendCommand);
}

function instrumentIoredis(ioredis) {
  shimmer.wrap(ioredis.prototype, 'sendCommand', instrumentIoredisSendCommand);
}

function instrumentNodeRedisSendCommand(original) {
  return instrumentSendCommand(original, 'command');
}

function instrumentIoredisSendCommand(original) {
  return instrumentSendCommand(original, 'name');
}

function instrumentSendCommand(original, nameProp) {
  return function wrappedInternalSendCommand(command) {
    var client = this;

    if (typeof command[nameProp] !== 'string' || !isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      // multi commands could actually be recorded as multiple spans, but we only want to record one
      // batched span
      if (parentSpan.n === 'redis' && (parentSpan.data.redis.command === 'multi' || parentSpan.data.redis.command === 'pipeline')) {
        var parentSpanSubCommands = parentSpan.data.redis.subCommands = parentSpan.data.redis.subCommands || [];
        parentSpanSubCommands.push(command[nameProp]);

        if (command[nameProp].toLowerCase() === 'exec') {
          if (command.promise) {
            var cb = cls.ns.bind(getMultiCommandEndCall(parentSpan));
            command.promise.then(function() { cb(); }, cb);
          } else {
            command.callback = cls.ns.bind(getMultiCommandEndCall(parentSpan, command.callback));
          }
        }
      }
      return original.apply(this, arguments);
    }

    var span = cls.startSpan('redis');
    span.stack = tracingUtil.getStackTrace(wrappedInternalSendCommand);
    var address = client.address || client.options.host + ':' + client.options.port;
    span.data = {
      redis: {
        connection: address,
        command: command[nameProp].toLowerCase()
      }
    };

    var userProvidedCallback;
    if (command.promise) {
      command.promise.then(cls.ns.bind(function() { onResult(); }), cls.ns.bind(onResult));
    } else {
      userProvidedCallback = command.callback;
      command.callback = cls.ns.bind(onResult);
    }
    return original.apply(this, arguments);

    function onResult(error) {
      // multi commands are ended by exec. Wait for the exec result
      if (command[nameProp] === 'multi' || command[nameProp] === 'pipeline') {
        if (typeof userProvidedCallback === 'function') {
          return userProvidedCallback.apply(this, arguments);
        }
        return undefined;
      }

      span.d = Date.now() - span.ts;

      if (error) {
        span.error = true;
        span.ec = 1;
        span.data.redis.error = error.message;
      }

      transmission.addSpan(span);

      if (typeof userProvidedCallback === 'function') {
        return userProvidedCallback.apply(this, arguments);
      }
    }
  };
}

function getMultiCommandEndCall(span, userProvidedCallback) {
  return function multiCommandEndCallback(error) {
    span.d = Date.now() - span.ts;

    var subCommands = span.data.redis.subCommands;
    var commandCount = subCommands ? subCommands.length : 1;

    span.b = {
      s: commandCount,
      u: false
    };

    if (error) {
      span.error = true;
      span.ec = commandCount;
      span.data.redis.error = error.message;
    }

    transmission.addSpan(span);

    if (typeof userProvidedCallback === 'function') {
      return userProvidedCallback.apply(this, arguments);
    }
  };
}
