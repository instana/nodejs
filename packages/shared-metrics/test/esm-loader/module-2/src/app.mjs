/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

import express from 'express';

const port = process.env.APP_PORT || 44004;
const app = express();
const logPrefix = `EJS preload collector: (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.send('OK');
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
