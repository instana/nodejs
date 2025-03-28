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

const agentPort = process.env.AGENT_PORT;
const instana = require('../../../..')({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const buynan = require('bunyan');
instana.setLogger(buynan.createLogger({ name: 'app-logger' }));

const instanaLogger = require('../../../../src/logger').getLogger();

const bodyParser = require('body-parser');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `Bunyan App [Instana receives Bunyan logger] (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/trigger', (req, res) => {
  instanaLogger.error('An error logged by Instana - this must not be traced');
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
