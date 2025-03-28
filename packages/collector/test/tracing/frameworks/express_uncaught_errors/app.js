/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');
require('@instana/core/test/test_util/mockRequireExpress');

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();

const app = express();
const logPrefix = `Express uncaughtErrors App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

// eslint-disable-next-line
app.get('/customErrorHandler', (req, res) => {
  throw new Error('To be caught by custom error handler');
});

// eslint-disable-next-line
app.use((err, req, res, next) => {
  res.sendStatus(400);
});

// eslint-disable-next-line
app.get('/defaultErrorHandler', (req, res) => {
  throw new Error('To be caught by default error handler');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
