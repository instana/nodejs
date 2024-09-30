/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../../src')({
  tracing: {
    allowRootExitSpan: true
  }
});

const fetch = require('node-fetch-v2');

const url = 'https://www.example.com';

/* eslint-disable no-console */
function main() {
  setTimeout(() => {
    instana.sdk.async
      .startEntrySpan('test-timeout-span')
      .then(async () => {
        try {
          await fetch(url);
        } catch (error) {
          console.log(error);
        } finally {
          instana.sdk.async.completeEntrySpan();
        }
      })
      .catch(err => {
        instana.sdk.async.completeEntrySpan(err);
        console.log('Error starting test-timeout-span:', err);
      });
  }, 100);
}
main();
