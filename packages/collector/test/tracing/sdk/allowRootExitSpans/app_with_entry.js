/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../../src')({
  tracing: {
    allowRootExitSpan: true,
    useOpentelemetry: false
  }
});
const agentPort = process.env.INSTANA_AGENT_PORT;
const { delay } = require('../../../../../core/test/test_util');
const fetch = require('node-fetch-v2');

const executeRequest = async () => {
  let error;

  try {
    await instana.sdk.async.startEntrySpan('my-translation-service');
    await fetch(`http://127.0.0.1:${agentPort}`);
  } catch (err) {
    error = err;
  } finally {
    instana.sdk.async.completeEntrySpan(error);
  }
};

// Main function to execute the request with delay
const runApp = async () => {
  await delay(200);
  await executeRequest(); // Execute the request
};

runApp();
