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
  shimmer.wrap(ioredis.prototype, 'sendCommand', instrumentSendCommand);
  shimmer.wrap(ioredis.prototype, 'pipeline', instrumentPipelineCommand);
}

function instrumentSendCommand(original) {
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
    if (cls.isExitSpan(parentSpan) && parentSpan.n === 'redis') {
      // multi commands could actually be recorded as multiple spans, but we only want to record one
      // batched span considering that a multi call represents a transaction.
      // The same is true for pipeline calls, but they have a slightly different semantic.
      var isMultiParent = parentSpan.data.redis.command === 'multi';
      var isPipelineParent = parentSpan.data.redis.command === 'pipeline';
      if (parentSpan.n === 'redis' && (isMultiParent || isPipelineParent)) {
        var parentSpanSubCommands = parentSpan.data.redis.subCommands = parentSpan.data.redis.subCommands || [];
        parentSpanSubCommands.push(command.name);

        if (command.name.toLowerCase() === 'exec' &&
            // pipelining is handled differently in ioredis
            isMultiParent) {
          // the exec call is actually when the transmission of these commands to redis is happening
          parentSpan.ts = Date.now();
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
      if (command.name === 'multi') {
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
    var commandCount = 1;
    if (subCommands) {
      // remove exec call
      subCommands.pop();
      commandCount = subCommands.length;
    }

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

function instrumentPipelineCommand(original) {
  return function wrappedInternalPipelineCommand() {
    var client = this;

    if (!isActive ||
        !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      return original.apply(this, arguments);
    }

    var span = cls.startSpan('redis');
    span.stack = tracingUtil.getStackTrace(wrappedInternalPipelineCommand);
    span.data = {
      redis: {
        connection: client.options.host + ':' + client.options.port,
        command: 'pipeline'
      }
    };

    var pipeline = original.apply(this, arguments);
    shimmer.wrap(pipeline, 'exec', instrumentPipelineExec.bind(null, span));
    return pipeline;
  };
}

function instrumentPipelineExec(span, original) {
  return function instrumentedPipelineExec() {
    // the exec call is actually when the transmission of these commands to redis is happening
    span.ts = Date.now();

    var result = original.apply(this, arguments);
    if (result.then) {
      result.then(function(results) {
        pipelineCommandEndCallback(span, null, results);
      }, function(error) {
        pipelineCommandEndCallback(span, error, []);
      });
    }
    return result;
  };
}

function pipelineCommandEndCallback(span, error, results) {
  span.d = Date.now() - span.ts;

  var subCommands = span.data.redis.subCommands;
  var commandCount = subCommands ? subCommands.length : 1;

  span.b = {
    s: commandCount,
    u: false
  };

  if (error) {
    // ioredis docs mention that this should never be possible, but better be safe than sorry
    span.error = true;
    span.ec = commandCount;
    span.data.redis.error = tracingUtil.getErrorDetails(error);
  } else {
    var numberOfErrors = 0;
    var sampledError = undefined;

    // results is an array of the form
    // [[?Error, ?Response]]
    for (var i = 0; i < results.length; i++) {
      if (results[i][0]) {
        numberOfErrors += 1;
        sampledError = sampledError || results[i][0];
      }
    }

    if (numberOfErrors > 0) {
      span.error = true;
      span.ec = numberOfErrors;
      span.data.redis.error = tracingUtil.getErrorDetails(sampledError);
    }
  }

  transmission.addSpan(span);
}
