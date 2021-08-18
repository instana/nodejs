/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const instana = require('../../../../collector');
require('../../../src/dependencies').MAX_DEPENDENCIES = 75;
instana();

const { getLogger } = require('../../../../core/test/test_util/log');

const express = require('express');
const morgan = require('morgan');

const logPrefix = `Dependencies App (${process.pid}):\t`;
const log = getLogger(logPrefix);

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => res.sendStatus(200));

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});
