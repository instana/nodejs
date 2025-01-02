/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies, instana/no-unsafe-require
const logger = require('pino');

// NOTE: There is a bug in the pino instrumentation. As soon as you require pino twice,
//       only the first require is instrumented. `onFileLoad` causes the behavior for that.
//       See https://jsw.ibm.com/browse/INSTA-23066
// NOTE: We need the removal of the cache here anyway, because we do not want to trigger the pino instrumentation.
//       This is an uninstrumented pino logger.
Object.keys(require.cache).forEach(key => {
  if (key.includes('pino')) {
    delete require.cache[key];
  }
});

function createCustomLogger() {
  const customLogger = Object.assign(function (/** @type {any} */ ...args) {
    // @ts-ignore
    return logger(...args);
  }, logger);

  return customLogger;
}

module.exports = createCustomLogger();
