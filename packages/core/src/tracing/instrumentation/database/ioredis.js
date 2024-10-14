/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
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
  hook.onModuleLoad('ioredis', instrument);
};

function instrument(ioredis) {
  shimmer.wrap(ioredis.prototype, 'sendCommand', instrumentSendCommand);
  shimmer.wrap(ioredis.prototype, 'multi', instrumentMultiCommand);
  shimmer.wrap(ioredis.prototype, 'pipeline', instrumentPipelineCommand);

  // TODO: https://jsw.ibm.com/browse/INSTA-14540
  //       We currently have no multi/pipeline spans for clusters.
  // shimmer.wrap(ioredis.Cluster.prototype, 'sendCommand', instrumentSendCommand);
  // shimmer.wrap(ioredis.Cluster.prototype, 'multi', instrumentMultiCommand);
  // shimmer.wrap(ioredis.Cluster.prototype, 'pipeline', instrumentPipelineCommand);
}

function instrumentSendCommand(original) {
  return function wrappedInternalSendCommand(command) {
    const client = this;

    // We need to skip parentSpan condition because the parentSpan check is too specific in this fn
    const skipExitTracingResult = cls.skipExitTracing({ isActive, skipParentSpanCheck: true, extendedResponse: true });
    const parentSpan = skipExitTracingResult.parentSpan;
    let callback;

    if (command.promise == null || typeof command.name !== 'string' || skipExitTracingResult.skip) {
      return original.apply(this, arguments);
    }

    // TODO: Why do we trace each sub command as separate spans (exec, hset, hget etc.)?
    //       https://jsw.ibm.com/browse/INSTA-14540
    // NOTE: there is separate "pipeline" call from "instrumentSendCommand"
    //       only for "multi". Thats why we filter it out here.
    if (
      parentSpan &&
      parentSpan.n === exports.spanName &&
      (parentSpan.data.redis.command === 'multi' || parentSpan.data.redis.command === 'pipeline') &&
      command.name !== 'multi'
    ) {
      const parentSpanSubCommands = (parentSpan.data.redis.subCommands = parentSpan.data.redis.subCommands || []);
      parentSpanSubCommands.push(command.name);
    } else if (
      // If allowRootExitSpan is not enabled then an EXIT SPAN can't exist alone
      (!skipExitTracingResult.allowRootExitSpan && parentSpan && constants.isExitSpan(parentSpan)) ||
      !parentSpan
    ) {
      // Apart from the special case of multi/pipeline calls, redis exits can't be child spans of other exits
      return original.apply(this, arguments);
    }

    const argsForOriginal = arguments;
    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(exports.spanName, constants.EXIT);
      span.stack = tracingUtil.getStackTrace(wrappedInternalSendCommand);

      const connection = `${client.options.host}:${client.options.port}`;

      // TODO: https://jsw.ibm.com/browse/INSTA-14540
      // if (client.isCluster) {
      //  connection = client.startupNodes.map(node => `${node.host}:${node.port}`).join(',');

      span.data.redis = {
        connection,
        command: command.name.toLowerCase()
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
    const client = this;
    const skipExitTracingResult = cls.skipExitTracing({ isActive, skipParentSpanCheck: true, extendedResponse: true });
    const parentSpan = skipExitTracingResult.parentSpan;

    // NOTE: multiple redis transaction can have a parent ioredis call
    // If cls.skipExitTracing wants to skip the tracing then skip it
    // Also if allowRootExitSpan is not enabled then an EXIT SPAN can't exist alone
    if (
      skipExitTracingResult.skip ||
      (!skipExitTracingResult.allowRootExitSpan && parentSpan && constants.isExitSpan(parentSpan)) ||
      (!skipExitTracingResult.allowRootExitSpan && !parentSpan)
    ) {
      return original.apply(this, arguments);
    }

    const connection = `${client.options.host}:${client.options.port}`;

    // TODO: https://jsw.ibm.com/browse/INSTA-14540
    // if (client.isCluster) {
    //   connection = client.startupNodes.map(node => `${node.host}:${node.port}`).join(',');

    // create a new cls context parent to track the multi/pipeline child calls
    const clsContextForMultiOrPipeline = cls.ns.createContext();
    cls.ns.enter(clsContextForMultiOrPipeline);
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(wrappedInternalMultiOrPipelineCommand);
    span.data.redis = {
      connection,
      command: commandName
    };

    const multiOrPipeline = original.apply(this, arguments);
    shimmer.wrap(
      multiOrPipeline,
      'exec',
      instrumentMultiOrPipelineExec.bind(null, clsContextForMultiOrPipeline, commandName, span)
    );
    return multiOrPipeline;
  };
}

function instrumentMultiOrPipelineExec(clsContextForMultiOrPipeline, commandName, span, original) {
  const endCallback = commandName === 'pipeline' ? pipelineCommandEndCallback : multiCommandEndCallback;

  return function instrumentedExec() {
    // the exec call is actually when the transmission of these commands to
    // redis is happening
    span.ts = Date.now();

    const result = original.apply(this, arguments);
    if (result.then) {
      result.then(
        results => {
          endCallback.call(null, clsContextForMultiOrPipeline, span, null, results);
        },
        error => {
          endCallback.call(null, clsContextForMultiOrPipeline, span, error, []);
        }
      );
    }
    return result;
  };
}

function multiCommandEndCallback(clsContextForMultiOrPipeline, span, error) {
  span.d = Date.now() - span.ts;

  const subCommands = span.data.redis.subCommands;
  let commandCount = 1;
  if (subCommands) {
    // remove exec call
    subCommands.pop();
    commandCount = subCommands.length;
  }

  span.b = {
    s: commandCount
  };

  if (error) {
    span.ec = commandCount;
    span.data.redis.error = error.message;
  }

  span.transmit();
  cls.ns.exit(clsContextForMultiOrPipeline);
}

function pipelineCommandEndCallback(clsContextForMultiOrPipeline, span, error, results) {
  span.d = Date.now() - span.ts;

  const subCommands = span.data.redis.subCommands;
  const commandCount = subCommands ? subCommands.length : 1;

  span.b = {
    s: commandCount
  };

  if (error) {
    // ioredis docs mention that this should never be possible, but better be safe than sorry
    span.ec = commandCount;
    span.data.redis.error = tracingUtil.getErrorDetails(error);
  } else {
    let numberOfErrors = 0;
    let sampledError;

    // results is an array of the form
    // [[?Error, ?Response]]
    for (let i = 0; i < results.length; i++) {
      if (results[i][0]) {
        numberOfErrors += 1;
        sampledError = sampledError || results[i][0];
      }
    }

    if (numberOfErrors > 0) {
      span.ec = numberOfErrors;
      span.data.redis.error = tracingUtil.getErrorDetails(sampledError);
    }
  }

  span.transmit();
  cls.ns.exit(clsContextForMultiOrPipeline);
}
