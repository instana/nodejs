/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// If a process is started with `npm start` or `yarn start`, two separate processes will be started. The first is
// `node /path/to/npm` (or `node /path/to/yarn`). This process will kick off another process with the actual application
// (for example, `node /usr/src/app`). When
// NODE_OPTIONS="--require /usr/src/app/node_modules/@instana/collector/src/immediate" is set, we would instrument both
// processes, that is, npm/yarn as well as the actual application. Attempting to instrument the npm or yarn process has
// no value and also creates confusing log output, so we exclude them here explicitly.
const excludePattern = /^.*\/(?:npm(?:\.js)?|npm-cli(?:\.js)?|yarn(?:\.js)?|yarn\/lib\/cli(?:\.js)?)$/i;

/**
 * Determines if the current process is a Pino thread-stream worker.
 * Pino uses background worker threads for "thread-stream" logging, which should not be instrumented.
 * @returns {boolean}
 */
function isPinoThreadStreamWorker() {
  try {
    const { isMainThread, workerData } = require('worker_threads');
    if (isMainThread) return false;

    if (workerData && typeof workerData === 'object') {
      const nested = workerData.workerData;
      const isPinoWorker =
        typeof workerData.filename === 'string' &&
        nested &&
        nested.$context &&
        typeof nested.$context.threadStreamVersion === 'string';

      if (isPinoWorker) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @type {Function}
 * @returns {boolean}
 */
module.exports = exports = function isExcludedFromInstrumentation() {
  const mainModule = process.argv[1];
  let excludedFromInstrumentation = typeof mainModule === 'string' && excludePattern.test(mainModule);
  let reason = 'npm-yarn';

  if (!excludedFromInstrumentation && isPinoThreadStreamWorker()) {
    excludedFromInstrumentation = true;
    reason = 'pino-thread-stream';
  }

  const logEnabled =
    process.env.INSTANA_DEBUG ||
    (process.env.INSTANA_LOG_LEVEL && ['info', 'debug'].includes(process.env.INSTANA_LOG_LEVEL.toLowerCase()));

  if (excludedFromInstrumentation && logEnabled) {
    if (reason === 'pino-thread-stream') {
      // eslint-disable-next-line no-console
      console.log(
        // eslint-disable-next-line max-len
        `[Instana] INFO: Skipping instrumentation for process ${process.pid} - detected as a Pino thread-stream worker. ` +
          'Logging threads do not require instrumentation.'
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[Instana] INFO: Not instrumenting process ${process.pid}: ${process.argv[0]} ${mainModule}` +
          ' - this Node.js process seems to be npm or yarn. A child process started via "npm start" or "yarn start" ' +
          '_will_ be instrumented, but not npm or yarn itself.'
      );
    }
  }

  return excludedFromInstrumentation;
};
