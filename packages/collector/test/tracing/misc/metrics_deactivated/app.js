/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../..')();
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `Metrics activation is off (${process.pid}):\t`;
const agentPort = process.env.INSTANA_AGENT_PORT;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/create-spans', async (req, res) => {
  await fetch(`http://localhost:${agentPort}/ping`);
  res.json({ message: 'OK' });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
