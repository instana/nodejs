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

require('@instana/collector')();
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const port = require('@_local/collector/test/test_util/app-port')();
const app = express();
const logPrefix = `fetch App (${process.pid}):\t`;

const agentPort = process.env.INSTANA_AGENT_PORT;

// node-fetch v3+ is ESM-only and uses Node.js native require(esm) to load on CJS app
// Reference: https://joyeecheung.github.io/blog/2025/12/30/require-esm-in-node-js-from-experiment-to-stability/
let fetch;
if (process.env.USE_REQUIRE_ESM === 'true') {
  const fetchModule = require('node-fetch');
  fetch = fetchModule.default;
} else {
  // For node-fetch v2 and below: Use traditional CommonJS require
  fetch = require('node-fetch');
}

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  res.sendStatus(200);
});

app.get('/request', async (req, res) => {
  await fetch(`http://127.0.0.1:${agentPort}/ping`);
  res.json({});
});

app.get('/callInvalidUrl', async (req, res) => {
  await fetch('://127.0.0.555:49162/foobar');
  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
