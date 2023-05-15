/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: Works because this is already the same collector instance. Node.js will automatically
//       return the cached instance.
// const instana = await import(process.env.INSTANA_COLLECTOR_PATH);
// const initializedInstana = instana.default;

// NOTE: This works, because we call the init fn of the collector again and
//       the cached exports from the first initialization (see load-instana.js) is returned.
//       For ESM it works because our collector is CJS.
// TODO: #125683
import instana from '../../../../../../src/index.js';
const initializedInstana = instana();

// NOTE: Does not work, because this is a new instance in the require cache and this code
//       was never initialized.
// import instana from '../../../../../../src/index.js';

import express from 'express';
import delay from '@instana/core/test/test_util/delay.js';

const port = process.env.APP_PORT;
const app = express();
const logPrefix = `ESM SDK multiple installations: (${process.pid}):\t`;

async function createSDKSpans() {
  // NOTE: We need the delay here to ensure that the collector is fully initialized.
  //       Otherwise we will get NoopSpanHandle instances because tracing is not ready yet.
  //       For customers the delay can be tiny (~500ms), but for the test we need to choose a bigger
  //       delay, because we need to ensure that the test has already started and won't call
  //       beforeEach(() => this.clearReceivedData());
  // TODO: ticket #125682
  await delay(2000);

  await initializedInstana.sdk.async.startEntrySpan('entryspan');
  // console.log(initializedInstana.currentSpan());
  await initializedInstana.sdk.async.startIntermediateSpan('intermediate-span-name');

  try {
    // console.log(initializedInstana.currentSpan());
    await initializedInstana.sdk.async.completeIntermediateSpan();
  } catch (err) {
    await initializedInstana.sdk.async.completeIntermediateSpan();
  }

  initializedInstana.sdk.async.completeEntrySpan();
}

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/trace', (req, res) => res.status(200).send('OK'));

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
