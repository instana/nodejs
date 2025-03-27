/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// This application is deliberately not instrumented manually with require('@instana/collector'), it is meant to be used
// with NODE_OPTIONS="--require ...".

const express = require('express-v4');
const morgan = require('morgan');

const app = express();
const port = require('../test_util/app-port')();

const logPrefix = `Auto Attach (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/pid', (req, res) => {
  res.send(String(process.pid));
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
