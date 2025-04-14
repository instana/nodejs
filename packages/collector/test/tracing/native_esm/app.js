/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const mock = require('@instana/core/test/test_util/mockRequire');
mock('square-calc', 'square-calc-v2');
require('../../..')();
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const getAppPort = require('../../test_util/app-port');
const calculateSquare = require('square-calc');

const port = getAppPort();

const app = express();
const logPrefix = `Native ESM App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  res.sendStatus(200);
});

app.get('/request', async (req, res) => {
  const square = calculateSquare(5);
  res.json({ square });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}

module.exports = app;
