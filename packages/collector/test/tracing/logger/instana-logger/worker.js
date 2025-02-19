/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

const { workerData } = require('worker_threads');

console.log('Worker thread: Starting', workerData);

const instana = require('../../../..')({
  agentPort: workerData.agentPort
});

(async () => {
  // NOTE: wait til the collector is ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  await instana.sdk.async.startEntrySpan();
  await fetch('https://httpstat.us/200');
  instana.sdk.async.completeEntrySpan();

  console.log('Worker thread: Done');
})();
