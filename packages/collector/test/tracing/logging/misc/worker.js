/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

const { workerData } = require('worker_threads');

console.log('Worker thread: Starting', workerData);

const instana = require('@instana/collector')({
  agentPort: workerData.agentPort
});

(async () => {
  // NOTE: wait til the collector is ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Worker thread: Creating spans...');

  await instana.sdk.async.startEntrySpan();

  await fetch(`http://localhost:${workerData.agentPort}`);
  instana.sdk.async.completeEntrySpan();

  console.log('Worker thread: Done');
})();
