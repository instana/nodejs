/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const express = require('express');
const fs = require('fs');
const port = require('@_local/collector/test/test_util/app-port')();
const app = express();
const logPrefix = `FS App (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/fsread', (req, res) => {
  log('Received /fsread request');

  // NOTE: instana http span, single otel span without parent
  fs.readFileSync(__filename);
  res.send();
});

app.get('/fsread2', (req, res) => {
  log('Received /fsread2 request');

  // NOTE: instana http span, fs otel span as parent and another fs span
  fs.readFileSync(__filename);
  fs.statSync(__filename);

  res.send();
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
