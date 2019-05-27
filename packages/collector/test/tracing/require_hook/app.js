/* eslint-disable no-console */

'use strict';

require('../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const app = express();
const logPrefix = `requireHook App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/requireRequestPromiseMultipleTimes', (req, res) => {
  require('request');
  require('request-promise'); // executes stealthy-require
  require('request-promise-native'); // executes stealthy-require
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
