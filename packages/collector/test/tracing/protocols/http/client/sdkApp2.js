/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/load_express_v4');

const instana = require('../../../../..')();
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('../../../../test_util/app-port')();

const app = express();
const logPrefix = 'SDK App 2\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/deferred-exit', (req, res) => {
  /*
  We do not support this case, because calling "startExitSpan" calls "skipExitTracing"
  and this function does not respect reduced spans.

  setTimeout(async () => {
    await instana.sdk.async.startExitSpan('deferred-exit');
    instana.sdk.async.completeExitSpan();
  }, 1000);
  */

  setTimeout(async () => {
    await instana.sdk.async.startEntrySpan('deferred-entry');
    await instana.sdk.async.startExitSpan('deferred-exit');
    instana.sdk.async.completeExitSpan();
    instana.sdk.async.completeEntrySpan();
  }, 1000);

  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
