/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const pinoWasRequiredBeforeUs = Object.keys(require.cache).some(key => key.includes('node_modules/pino'));

// eslint-disable-next-line import/no-extraneous-dependencies, instana/no-unsafe-require

const pino = require('pino').default;

// TODO: Fix the issue with Pino instrumentation. If Pino is required multiple times,
//       only the first require is instrumented. `onFileLoad` causes the behavior for that.
//       See https://jsw.ibm.com/browse/INSTA-23066
// NOTE: We need the removal of the cache here anyway, because we do not want to trigger the pino instrumentation.
//       This is an uninstrumented pino logger.
//       If pino was required before us, we leave the cache as it is.
// NOTE: Clearing the require cache is only needed because of onFileLoad usage in the pino instrumentation.
//       As soon as we can migrate to use onModuleLoad in the instrumentation,
//       we can remove this and ensure that the internal logger is called before the instr initialization.
if (!pinoWasRequiredBeforeUs) {
  Object.keys(require.cache).forEach(key => {
    if (key.includes('node_modules/pino')) {
      delete require.cache[key];
    }
  });
}

module.exports = pino;
