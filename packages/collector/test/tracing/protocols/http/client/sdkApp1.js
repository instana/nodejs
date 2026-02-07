/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('@instana/collector')();
const { delay } = require('@instana/core/test/test_util');

const agentPort = process.env.INSTANA_AGENT_PORT;

const main = async () => {
  let err1;

  try {
    await fetch(`http://127.0.0.1:${agentPort}/ping`);

    await instana.sdk.async.startEntrySpan('my-translation-service');

    await fetch(`http://127.0.0.1:${agentPort}/ping`);
  } catch (err) {
    err1 = err;
  }

  instana.sdk.async.completeEntrySpan(err1);
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
