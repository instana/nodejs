/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// NOTE: Works because this is already the same collector instance. Node.js will automatically
//       return the cached instance.
// const instana = await import(process.env.INSTANA_COLLECTOR_PATH);
// const initializedInstana = instana.default;

// NOTE: This works, because we call the init fn of the collector again and
//       the cached exports from the first initialization (see load-instana.js) is returned.
//       For ESM it works because our collector is CJS.
// TODO: #125683
import instana from '@instana/collector/src/index.js';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
const initializedInstana = instana();

// NOTE: Does not work, because this is a new instance in the require cache and this code
//       was never initialized.
// import instana from '@instana/collector/src/index.js';

import express from 'express';
import delay from '@_local/core/test/test_util/delay.js';

const port = getAppPort();
const app = express();
const logPrefix = `ESM SDK multiple installations: (${process.pid}):\t`;
let sendSDKSpans = false;

(async function createSDKSpans() {
  if (!sendSDKSpans) return setTimeout(createSDKSpans, 1000);
  await delay(500);

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
})();

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/trace', (req, res) => {
  sendSDKSpans = true;
  res.status(200).send('OK');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix} (${process.pid}):\t${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
