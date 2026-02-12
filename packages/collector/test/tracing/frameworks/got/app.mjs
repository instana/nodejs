/*
 * (c) Copyright IBM Corp. 2022
 */

/* eslint-disable no-console */

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
const port = getAppPort();
/**
 * NOTE: From v12 the got module is pure ESM.
 * See https://github.com/sindresorhus/got/releases/tag/v12.0.0.
 * In ESM test, we use the latest got module.
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
  await got.get(`http://127.0.0.1:${agentPort}/ping`);

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
