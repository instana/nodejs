/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const pinoWasRequiredBeforeUs = Object.keys(require.cache).some(key => key.includes('node_modules/pino'));

// NOTE: The pino instrumentation is not yet loaded. The logger is loaded very early in our codebase.
//       Therefore our internal pino instance will not be instrumented.
//       BUT our pino require still loads pino into the internal node.js cache. Especially the files of the pino library
//       such as lib/tools.js. These sub requires are not triggered anymore when pino is required the second time.
//       That means if the customer is using the SAME npm version (our version), it won't get traced without our manual
//       cache deletion below.
//       If the customer has its own pino version, it will be traced correctly, because it will trigger "onFileLoad".
// TODO: Consider migrating to "onModuleLoad". This will remove the need of having to manually delete the cache entry,
//       because any later pino require will trigger the require hook again with "pino" as module name.
//       Furthermore, using "onModuleLoad" is much more clean because we don't have to rely on the precense of
//       lib/tools.js.
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
