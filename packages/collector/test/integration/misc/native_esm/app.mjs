/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});
import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
import calculateSquare from 'square-calc';
const port = getAppPort();

const app = express();
const logPrefix = `Native ESM App (${process.pid}):\t`;

const agentPort = process.env.INSTANA_AGENT_PORT;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  res.sendStatus(200);
});

app.get('/request', async (req, res) => {
  const square = calculateSquare(5);
  res.json({ square });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
