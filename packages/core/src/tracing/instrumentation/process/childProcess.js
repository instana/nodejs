'use strict';

var coreChildProcess = require('child_process');
var shimmer = require('shimmer');

var selfPath = require('./selfPath');

var logger;
logger = require('../../../logger').getLogger('tracing/child_process', function(newLogger) {
  logger = newLogger;
});

// This instruments the code that is used when edgemicro is started with the forever monitor, that is, via
// `edgemicro forever -a start`. It adds --require /path/to/@instana/collecor/src/immediate to the arguments,
// effectively adding Instana instrumentation to the processes started via forever-monitor.
//
// There is also ./edgemicro.js, which is responsible for instrumenting the code that is used to spawn the individual
// edgemicro workers.
exports.init = function() {
  shimmer.wrap(coreChildProcess, 'spawn', shimSpawn);
};

function shimSpawn(original) {
  return function(command, args) {
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
          'Detected a child_process.spawn of edgemicro/app, instrumenting it by adding --require ' +
            selfPath.immediate +
            '.'
        );
        args.unshift(selfPath.immediate);
        args.unshift('--require');
      }
    }

    return original.apply(this, arguments);
  };
}

exports.activate = function() {
  // no-op
};

exports.deactivate = function() {
  // no-op
};
