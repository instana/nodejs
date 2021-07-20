/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */
// @ts-nocheck - tracing/instrumentation is out of context for now

'use strict';

const processIdentityProvider = require('../../../pidStore');

const getCls = require('@instana/core').tracing.getCls;
const coreChildProcess = require('child_process');
const shimmer = require('shimmer');

const selfPath = require('./selfPath');

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../../../logger').getLogger('tracing/child_process', newLogger => {
  logger = newLogger;
});

// This instruments the code that is used when edgemicro is started with the forever monitor, that is, via
// `edgemicro forever -a start`. It adds --require /path/to/@instana/collecor/src/immediate to the arguments,
// effectively adding Instana instrumentation to the processes started via forever-monitor.
//
// There is also ./edgemicro.js, which is responsible for instrumenting the code that is used to spawn the individual
// edgemicro workers.
exports.init = function () {
  shimmer.wrap(coreChildProcess, 'spawn', shimSpawn);
  shimmer.wrap(coreChildProcess, 'fork', shimFork);
};

function shimSpawn(original) {
  return function (command, args) {
    if (
      // check if a command has been specified and it is the Node.js executable
      typeof command === 'string' &&
      /[^\w]node$/.test(command) &&
      // check if arguments have been specified
      args &&
      Array.isArray(args) &&
      args.length >= 1 &&
      // check if it is edgemicro trying to spawn its main process via forever
      // (happens when the `edgemicro forever -f forever.json -a start` command is used)
      /[^\w]edgemicro[^\w]app\.js$/.test(args[0])
    ) {
      if (!selfPath.immediate) {
        logger.warn(
          "Detected a child_process.spawn of 'edgemicro/app', but the path to @instana/collector is not available, " +
            'so this edgemicro instance will not be instrumented.'
        );
      } else {
        logger.debug(
          `Detected a child_process.spawn of edgemicro/app, instrumenting it by adding --require ${selfPath.immediate}.`
        );
        args.unshift(selfPath.immediate);
        args.unshift('--require');
      }
    }

    return original.apply(this, arguments);
  };
}

const bullMasterProcessMatch = /bull\/lib\/process\/master\.js/;

function shimFork(original) {
  return function () {
    // args: modulePath, args, options
    const _args = Array.prototype.slice.call(arguments);
    const modulePath = _args[0];
    const args = _args[1];

    if (typeof modulePath === 'string' && bullMasterProcessMatch.test(modulePath) && args && args.execArgv) {
      if (!selfPath.immediate) {
        logger.warn(
          "Detected a child_process.fork of 'Bull processor', but the path to @instana/collector is not available, " +
            'so this Bull processor instance will not be instrumented.'
        );
      } else {
        logger.debug(
          `Detected a child_process.fork of Bull, instrumenting it by adding --require ${selfPath.immediate}.`
        );

        process.env.INSTANA_AGENT_UUID = processIdentityProvider.getFrom().h;
        args.execArgv.unshift(selfPath.immediate);
        args.execArgv.unshift('--require');
      }

      /** @type {import('child_process').ChildProcess} */
      const childProcess = original.apply(this, _args);

      // Retrieve the entry span created by bull.js#instrumentedProcessJob.
      const originalChildProcessSend = childProcess.send;
      childProcess.send = function (message) {
        const cls = getCls();
        let entrySpan = null;

        if (cls) {
          entrySpan = cls.getCurrentSpan();
        }

        if (
          //
          message && //
          message.cmd === 'start' &&
          message.job &&
          typeof message.job === 'object' &&
          message.job.opts &&
          entrySpan &&
          entrySpan.k === 1
        ) {
          if (message.job.opts == null) {
            message.job.opts = {};
          }

          /**
           * Because this handles the process case, we don't need to care about repeatable jobs and handle
           * them by job id.
           * The reason is that here, we treat each job independently of each other, so it's ok to define the
           * instanaTracingContext object, instead of opts[job.id] as we do for the Callback and Promise case.
           */
          if (message.job.opts.instanaTracingContext == null) {
            message.job.opts.instanaTracingContext = {};
          }
          message.job.opts.instanaTracingContext.X_INSTANA_T = entrySpan.t;
          message.job.opts.instanaTracingContext.X_INSTANA_S = entrySpan.s;
        }

        originalChildProcessSend.apply(this, arguments);
      };

      return childProcess;
    } else {
      return original.apply(this, arguments);
    }
  };
}

exports.activate = function () {
  // no-op
};

exports.deactivate = function () {
  // no-op
};
