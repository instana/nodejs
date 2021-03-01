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
 * @type {Function}
 * @returns {boolean}
 */
module.exports = exports = function isExcludedFromInstrumentation() {
  const mainModule = process.argv[1];
  const excludedFromInstrumentation = typeof mainModule === 'string' && excludePattern.test(mainModule);

  if (excludedFromInstrumentation) {
    const logLevelIsDebugOrInfo =
      process.env.INSTANA_DEBUG ||
      (process.env.INSTANA_LOG_LEVEL &&
        (process.env.INSTANA_LOG_LEVEL.toLowerCase() === 'info' ||
          process.env.INSTANA_LOG_LEVEL.toLowerCase() === 'debug'));

    if (logLevelIsDebugOrInfo) {
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
