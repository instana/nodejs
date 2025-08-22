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

const expect = require('chai').expect;

require('@instana/core/test/test_util/loadExpressV4');

/**
 * We install the latest version of the collector here locally.
 * This ensures we are using the Opentelemetry production dependencies.
 */
expect(require.resolve('@instana/collector')).to.contain('opentelemetry/node_modules/@instana/collector');
require('@instana/collector')();

const express = require('express');
const fs = require('fs');
const path = require('path');
const port = require('../../test_util/app-port')();
const app = express();
const logPrefix = `FS App (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/fsread', (req, res) => {
  log('Received /fsread request');

  // NOTE: instana http span, single otel span without parent
  fs.readFileSync(path.join(__dirname, './test.js'));
  res.send();
});

app.get('/fsread2', (req, res) => {
  log('Received /fsread2 request');

  // NOTE: instana http span, fs otel span as parent and another fs span
  fs.readFileSync(path.join(__dirname, './test.js'));
  fs.statSync(path.join(__dirname, './test.js'));

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
