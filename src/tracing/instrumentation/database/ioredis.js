'use strict';

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
  requireHook.onModuleLoad('ioredis', instrument);
};

function instrument(ioredis) {
  shimmer.wrap(ioredis.prototype, 'sendCommand', instrumentSendCommand);
  shimmer.wrap(ioredis.prototype, 'multi', instrumentMultiCommand);
  shimmer.wrap(ioredis.prototype, 'pipeline', instrumentPipelineCommand);
}

function instrumentSendCommand(original) {
  return function wrappedInternalSendCommand(command) {
    var client = this;

    if (command.promise == null || typeof command.name !== 'string' || !isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var callback;
    var parentSpan = cls.getCurrentSpan();

    if (
      parentSpan.n === 'redis' &&
      (parentSpan.data.redis.command === 'multi' || parentSpan.data.redis.command === 'pipeline') &&
      // the multi call is handled in instrumentMultiCommand but since multi is also send to Redis it will also
      // trigger instrumentSendCommand, which is why we filter it out.
      command.name !== 'multi'
    ) {
      // multi commands could actually be recorded as multiple spans, but we only want to record one
      // batched span considering that a multi call represents a transaction.
      // The same is true for pipeline calls, but they have a slightly different semantic.
      var parentSpanSubCommands = (parentSpan.data.redis.subCommands = parentSpan.data.redis.subCommands || []);
      parentSpanSubCommands.push(command.name);
    } else if (cls.isExitSpan(parentSpan)) {
      // Apart from the special case of multi/pipeline calls, redis exits can't be child spans of other exits.
      return original.apply(this, arguments);
    }

    var argsForOriginal = arguments;
    return cls.ns.runAndReturn(function() {
      var span = cls.startSpan('redis', cls.EXIT);
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
        callback
      );

      return original.apply(client, argsForOriginal);

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

        span.transmit();
      }
    });
  };
}

function instrumentMultiCommand(original) {
  return instrumentMultiOrPipelineCommand('multi', original);
}

function instrumentPipelineCommand(original) {
  return instrumentMultiOrPipelineCommand('pipeline', original);
}

function instrumentMultiOrPipelineCommand(commandName, original) {
  return function wrappedInternalMultiOrPipelineCommand() {
    var client = this;

    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }

    var parentSpan = cls.getCurrentSpan();
    if (cls.isExitSpan(parentSpan)) {
      return original.apply(this, arguments);
    }

    // create a new cls context parent to track the multi/pipeline child calls
    var clsContextForMultiOrPipeline = cls.ns.createContext();
    cls.ns.enter(clsContextForMultiOrPipeline);
    var span = cls.startSpan('redis', cls.EXIT);
    span.stack = tracingUtil.getStackTrace(wrappedInternalMultiOrPipelineCommand);
    span.data = {
      redis: {
        connection: client.options.host + ':' + client.options.port,
        command: commandName
      }
    };

    var multiOrPipeline = original.apply(this, arguments);
    shimmer.wrap(
      multiOrPipeline,
      'exec',
      instrumentMultiOrPipelineExec.bind(null, clsContextForMultiOrPipeline, commandName, span)
    );
    return multiOrPipeline;
  };
}

function instrumentMultiOrPipelineExec(clsContextForMultiOrPipeline, commandName, span, original) {
  var endCallback = commandName === 'pipeline' ? pipelineCommandEndCallback : multiCommandEndCallback;
  return function instrumentedExec() {
    // the exec call is actually when the transmission of these commands to
    // redis is happening
    span.ts = Date.now();

    var result = original.apply(this, arguments);
    if (result.then) {
      result.then(
        function(results) {
          endCallback.call(null, clsContextForMultiOrPipeline, span, null, results);
        },
        function(error) {
          endCallback.call(null, clsContextForMultiOrPipeline, span, error, []);
        }
      );
    }
    return result;
  };
}

function multiCommandEndCallback(clsContextForMultiOrPipeline, span, error) {
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

  span.transmit();
  cls.ns.exit(clsContextForMultiOrPipeline);
}

function pipelineCommandEndCallback(clsContextForMultiOrPipeline, span, error, results) {
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
    var sampledError;

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

  span.transmit();
  cls.ns.exit(clsContextForMultiOrPipeline);
}
