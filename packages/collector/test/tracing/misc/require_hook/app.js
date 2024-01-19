/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `requireHook App (${process.pid}):\t`;
const stealthyRequire = require('stealthy-require');

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/multipleRequestsWithStealthyRequire', async (req, res) => {
  await makeSuperagentRequest('https://example.com/1');
  await makeSuperagentRequest('https://example.com/2');

  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
async function makeSuperagentRequest(url) {
  const superagentFresh = stealthyRequire(require.cache, () => require('superagent'));
  try {
    const response = await superagentFresh.get(url);
    log(`response ${response.body}`);
  } catch (error) {
    log(`error ${error}`);
  }
}
