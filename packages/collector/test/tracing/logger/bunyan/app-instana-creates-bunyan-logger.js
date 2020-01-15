/* eslint-disable no-console */

'use strict';

const agentPort = process.env.AGENT_PORT;

const instana = require('../../../..');
instana({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});
let instanaLogger;
instanaLogger = require('../../../../src/logger').getLogger('test-module-name', newLogger => {
  instanaLogger = newLogger;
});

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const app = express();
const logPrefix = `Bunyan App [Instana creates Bunyan logger] (${process.pid}):\t`;

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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
