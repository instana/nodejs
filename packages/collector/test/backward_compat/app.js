/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('@instana/collector')();

const express = require('express');
const fetch = require('node-fetch');

const agentPort = process.env.INSTANA_AGENT_PORT || 42699;

const app = express();

app.get('/', (req, res) => res.sendStatus(200));

app.get('/test', async (req, res) => {
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.sendStatus(200);
});

app.listen(process.env.APP_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port: ${process.env.APP_PORT}`);
});
