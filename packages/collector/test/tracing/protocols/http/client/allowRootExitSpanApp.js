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
const fetch = require('node-fetch-v2');

// eslint-disable-next-line no-console
console.log('Starting allowRootExitSpanApp...');

const main = async () => {
  try {
    setTimeout(async () => {
      await fetch('http://localhost');
      await fetch('http://localhost');
    }, 100);
  } catch (err) {
    /* eslint-disable no-console */
    console.log(err);
  }
};

const app = async () => {
  await delay(1000 * 2);

  let count = 0;

  while (count < 2) {
    // eslint-disable-next-line no-await-in-loop
    await main();
    count += 1;

    // eslint-disable-next-line no-await-in-loop
    await delay(500);
  }

  // eslint-disable-next-line no-console
  console.log('allowRootExitSpanApp finished');
};

app();
