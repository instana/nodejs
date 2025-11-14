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

const logPrefix = `Activate Immediately App (${process.pid}):\t`;
const port = require('../../../test_util/app-port')();
const express = require('express');
const app = express();
const agentPort = process.env.INSTANA_AGENT_PORT;

app.get('/', (req, res) => {
  res.send();
});

app.get('/trigger', async (req, res) => {
  await fetch(`http://localhost:${agentPort}/ping`);
  res.send();
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
