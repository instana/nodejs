/*
 * (c) Copyright IBM Corp. 2022
 */

/* eslint-disable no-console */

'use strict';

import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import getAppPort from '../../../test_util/app-port.js';
const port = getAppPort();

/**
 * NOTE: got v12 has dropped support for commonjs.
 *       It is possible to dynamically import a ESM module,
 *       but we simply stay on v11 to proof that got requests are auto-instrumented.
 *
 * (async () => {
 *   await import('got');
 * })();
 */
import got from 'got';

const app = express();
const logPrefix = `Got App (${process.pid}):\t`;

const agentPort = process.env.INSTANA_AGENT_PORT;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  res.sendStatus(200);
});

app.get('/request', async (req, res) => {
  await got.get(`http://127.0.0.1:${agentPort}`);

  res.json({});
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
