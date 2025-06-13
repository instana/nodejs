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
    allowRootExitSpan: true,
    useOpentelemetry: false
  }
});

const fetch = require('node-fetch-v2');

function main() {
  setTimeout(async () => {
    await fetch('https://example.com');
  }, 100);
}

main();
