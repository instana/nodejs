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
  requireHook.on('ioredis', instrument);
};


function instrument(ioredis) {
  shimmer.wrap(ioredis.prototype, 'sendCommand', instrumentIoredisSendCommand);
}

function instrumentIoredisSendCommand(original) {
  return function wrappedInternalSendCommand(command) {
    var client = this;

    if (command.promise == null ||
        typeof command.name !== 'string' ||
        !isActive ||
        !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var callback;
    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      // multi commands could actually be recorded as multiple spans, but we only want to record one
      // batched span
      if (parentSpan.n === 'redis' && parentSpan.data.redis.command === 'multi') {
        var parentSpanSubCommands = parentSpan.data.redis.subCommands = parentSpan.data.redis.subCommands || [];
        parentSpanSubCommands.push(command.name);

        if (command.name.toLowerCase() === 'exec') {
          callback = cls.ns.bind(getMultiCommandEndCall(parentSpan));
          command.promise.then(
            // make sure that the first parameter is never truthy
            callback.bind(null, null),
            callback);
        }
      }
      return original.apply(this, arguments);
    }

    var span = cls.startSpan('redis');
    span.stack = tracingUtil.getStackTrace(wrappedInternalSendCommand);
    span.data = {
      redis: {
        connection: client.options.host + ':' + client.options.port,
        command: command.name.toLowerCase()
      }
    };

    callback = cls.ns.bind(onResult);
    command.promise.then(
      // make sure that the first parameter is never truthy
      callback.bind(null, null),
      callback);
    return original.apply(this, arguments);

    function onResult(error) {
      // multi commands are ended by exec. Wait for the exec result
      if (command.name === 'pipeline') {
        return;
      }

      span.d = Date.now() - span.ts;

      if (error) {
        span.error = true;
        span.ec = 1;
        span.data.redis.error = error.message;
      }

      transmission.addSpan(span);
    }
  };
}

function getMultiCommandEndCall(span) {
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
  };
}
