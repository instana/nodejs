/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// Initiating the app with allowRootExitSpan configuration
// to make sure the existing functionality is working fine along with SDK wrap code
const instana = require('../../../../src')({
  tracing: {
    allowRootExitSpan: true
  }
});
const fetch = require('node-fetch-v2');
const url = 'https://www.instana.com';

/* eslint-disable no-console */
function main() {
  setTimeout(async () => {
    await fetch(url);
  }, 100);

  setTimeout(() => {
    instana.sdk.promise
      .startEntrySpan('test-timeout-span')
      .then(async () => {
        try {
          await fetch(url);
        } catch (error) {
          console.log(error);
        } finally {
          instana.sdk.promise.completeEntrySpan();
        }
      })
      .catch(err => {
        instana.sdk.promise.completeEntrySpan(err);
        console.log('Error starting test-timeout-span:', err);
      });
  }, 100);
}

main();
