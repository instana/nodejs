/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const pinoWasRequiredBeforeUs = Object.keys(require.cache).some(key => key.includes('node_modules/pino'));

// NOTE: The pino instrumentation is not yet loaded. The logger is loaded very early in our codebase.
//       Therefore our internal pino instance will not be instrumented.
//       BUT this require still loads pino into the internal node.js cache!
//       That means if the customer is using the SAME npm version (our version), it won't get traced!
//       Thats why we have to remove the cache entry manually after the require.
//       If the customer has its own pino version, it will be traced correctly, because it will trigger "onFileLoad".
// TODO: Migrate pino to "onModuleLoad". This will remove the need of having to manually delete the cache entry.
// SEE:  https://jsw.ibm.com/browse/INSTA-23066

// eslint-disable-next-line import/no-extraneous-dependencies, instana/no-unsafe-require
const pino = require('pino').default;

if (!pinoWasRequiredBeforeUs) {
  Object.keys(require.cache).forEach(key => {
    if (key.includes('node_modules/pino')) {
      delete require.cache[key];
    }
  });
}

module.exports = pino;
