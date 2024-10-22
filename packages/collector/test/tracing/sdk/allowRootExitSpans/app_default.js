/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../src')({
  tracing: {
    allowRootExitSpan: true
  }
});

const fetch = require('node-fetch-v2');

const url = 'https://www.example.com';

function main() {
  setTimeout(async () => {
    await fetch(url);
  }, 100);
}

main();
