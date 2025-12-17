/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const logPrefix = `CJS via ESM (${process.pid}):\t`;
const port = require('../../../test_util/app-port')();
const express = require('express');
const bodyParser = require('body-parser');
const pinoLogger = require('pino')();

const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/trigger', async (req, res) => {
  log('Received request');
  await fetch(`http://localhost:${port}`);
  pinoLogger.error('wtf');
  res.json({ success: true });
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
