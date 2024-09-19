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

const url = 'https://www.instana.com';

function main() {
  setTimeout(async () => {
    await fetch(url);
  }, 100);
}

main();
