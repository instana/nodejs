/*
 * (c) Copyright IBM Corp. 20215
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')({
  // NOTE: The test env mutes all logs by default. No logs, no agent logs.
  level: 'info'
});

const express = require('express');
const port = require('../../../test_util/app-port')();
const app = express();

const logPrefix = `Agent Logs App (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.send();
});

app.get('/trace', async (req, res) => {
  await fetch(`http://127.0.0.1:${agentPort}/ping`);
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
