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
};


function instrument(redis) {
  shimmer.wrap(redis.RedisClient.prototype, 'internal_send_command', instrumentInternalSendCommand);
}

function instrumentInternalSendCommand(original) {
  return function wrappedInternalSendCommand(command) {
    var client = this;

    if (typeof command.command !== 'string' || !isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      // multi commands could actually be recorded as multiple spans, but we only want to record one
      // batched span
      if (parentSpan.n === 'redis' && parentSpan.data.redis.command === 'multi') {
        var parentSpanSubCommands = parentSpan.data.redis.subCommands = parentSpan.data.redis.subCommands || [];
        parentSpanSubCommands.push(command.command);

        if (command.command.toLowerCase() === 'exec') {
          command.callback = cls.ns.bind(getMultiCommandEndCall(parentSpan, command.callback));
        }
      }
      return original.apply(this, arguments);
    }

    var span = cls.startSpan('redis');
    span.stack = tracingUtil.getStackTrace(wrappedInternalSendCommand);
    span.data = {
      redis: {
        connection: client.address,
        command: command.command.toLowerCase()
      }
    };

    var userProvidedCallback = command.callback;
    command.callback = cls.ns.bind(onResult);
    return original.apply(this, arguments);

    function onResult(error) {
      // multi commands are ended by exec. Wait for the exec result
      if (command.command === 'multi') {
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
