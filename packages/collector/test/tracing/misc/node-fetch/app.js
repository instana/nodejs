/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */

'use strict';

// NOTE:  c8 bug https://github.com/bcoe/c8/issues/166
// NOTE:  There is an open issue with the latest version of node-fetch that cause type errors.
//        Please refer to https://github.com/node-fetch/node-fetch/issues/1617 for more details.
//        As a temporary workaround, we've added "DOM" in the tsconfig file.
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `fetch App (${process.pid}):\t`;

const agentPort = process.env.INSTANA_AGENT_PORT;

const fetch = require('node-fetch-v2');
if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  res.sendStatus(200);
});

app.get('/request', async (req, res) => {
  await fetch(`http://127.0.0.1:${agentPort}`);

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
