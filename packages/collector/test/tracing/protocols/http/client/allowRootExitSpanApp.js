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

const agentPort = process.env.INSTANA_AGENT_PORT;

// eslint-disable-next-line no-console
console.log('Starting allowRootExitSpanApp...');

const main = async () => {
  try {
    await delay(100);
    await fetch('https://example.com');
    await fetch('https://www.example.com');
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

  // TODO: Our tracer does not support exiting without a hard exit (restart, process.exit, etc.)
  //       For workers we have to add e.g. `sdk.shutdown()` because we don't know if
  //       the worker is about to end or not.
  process.exit(0);
};

app();
