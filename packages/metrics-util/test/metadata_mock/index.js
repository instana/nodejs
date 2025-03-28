/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable consistent-return */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const bodyParser = require('body-parser');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();

const { sendToParent } = require('../../../core/test/test_util');

const logPrefix = 'metadata-mock';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const port = process.env.METADATA_MOCK_PORT;

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use(bodyParser.json());

app.get('/metadata', (req, res) =>
  res.json({
    key: 'value'
  })
);

app.listen(port, () => {
  logger.info('Listening on port: %s', port);
  sendToParent('metadata mock: started');
});
