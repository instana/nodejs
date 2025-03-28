/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/load_express_v4');

// NOTE: Works because this is already the same collector instance. Node.js will automatically
//       return the cached instance.
// const instana = require(process.env.INSTANA_COLLECTOR_PATH);

// NOTE: This works, because we call the init fn of the collector again and
//       the cached exports from the first initialization (see load-instana.js) is returned.
// TODO: #125683
const instana = require('../../../../../../src')({ agentPort: process.env.INSTANA_AGENT_PORT });

// NOTE: Does not work, because this is a new instance in the require cache and this code
//       was never initialized.
// const instana = require('../../../../../src');
const express = require('express');
const testUtils = require('@instana/core/test/test_util');
const getAppPort = require('@instana/collector/test/test_util/app-port');
const port = getAppPort();
const app = express();
const logPrefix = `CJS SDK multiple installations: (${process.pid}):\t`;

async function createSDKSpans() {
  // NOTE: We need the delay here to ensure that the collector is fully initialized.
  //       Otherwise we will get NoopSpanHandle instances because tracing is not ready yet.
  //       For customers the delay can be tiny (~500ms), but for the test we need to choose a bigger
  //       delay, because we need to ensure that the test has already started and won't call
  //       beforeEach(() => this.clearReceivedData());
  // TODO: ticket #125682
  await testUtils.delay(2500);

  await instana.sdk.async.startEntrySpan('entryspan');
  // console.log(initializedInstana.currentSpan());
  await instana.sdk.async.startIntermediateSpan('intermediate-span-name');

  try {
    // console.log(initializedInstana.currentSpan());
    await instana.sdk.async.completeIntermediateSpan();
  } catch (err) {
    await instana.sdk.async.completeIntermediateSpan();
  }

  instana.sdk.async.completeEntrySpan();
}

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/trace', (req, res) => {
  log('/trace');
  res.status(200).send('OK');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
  createSDKSpans();
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix} (${process.pid}):\t${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
