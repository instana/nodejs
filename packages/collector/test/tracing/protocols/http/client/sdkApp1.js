/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../../..')();
const { delay } = require('../../../../../../core/test/test_util');
const nodeFetch = require('node-fetch-v2');

const agentPort = process.env.INSTANA_AGENT_PORT;
// eslint-disable-next-line no-console
console.log('Starting sdkApp1...');

const main = async () => {
  let err1;

  try {
    const req = new nodeFetch.Request(`http://localhost:${agentPort}?query=1`);
    await nodeFetch(req);

    await instana.sdk.async.startEntrySpan('my-translation-service');
    await nodeFetch(`http://localhost:${agentPort}?query=2`);
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

  // eslint-disable-next-line no-console
  console.log('sdkApp1 finished');
};

app();
