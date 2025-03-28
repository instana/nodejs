/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('src/immediate')) {
  require('../../..')();
}

require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const morgan = require('morgan');
const port = require('../../test_util/app-port')();

const { getTestAppLogger: getLogger } = require('../../../../core/test/test_util');

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
