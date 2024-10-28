/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../..')();
const { delay } = require('../../../../../../core/test/test_util');

const main = async () => {
  setTimeout(async () => {
    await fetch('https://example.com');

    await fetch('https://www.example.com');
  }, 100);
};

const app = async () => {
  await delay(1000);
  let count = 0;

  while (count < 2) {
    // eslint-disable-next-line no-await-in-loop
    await main();
    count += 1;

    // eslint-disable-next-line no-await-in-loop
    await delay(500);
  }
};

app();
