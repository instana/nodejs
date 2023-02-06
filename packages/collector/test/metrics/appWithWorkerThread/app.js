/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

if (
  !process.env.NODE_OPTIONS ||
  // nyc adds its own NODE_OPTIONS=--require, thus only checking for the existence of NODE_OPTIONS is not good enough.
  !process.env.NODE_OPTIONS.includes('src/immediate')
) {
  // Either the test instruments this app via NODE_OTIONS=--require... or it expects the app to be instrumneted via
  // an in-code require.
  require('../../..')();
}

const express = require('express');
const morgan = require('morgan');
const port = require('../../test_util/app-port')();

const { getLogger } = require('../../../../core/test/test_util');

const app = express();
const logPrefix = `Worker Thread App (${process.pid}):\t`;
const log = getLogger(logPrefix);

// starts the worker thread
require('module-that-creates-a-worker-thread')();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
