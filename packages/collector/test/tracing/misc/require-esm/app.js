/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

require('@instana/collector')();

// Load ESM-only dependency using Node.js native require(esm) support
// got v14+ is ESM-only and exports a default export
const { default: got } = require('got');

const express = require('express');
const port = require('@_local/collector/test/test_util/app-port')();
const app = express();
const logPrefix = `require(esm) test app (${process.pid}):\t`;

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/make-request', async (req, res) => {
  const targetUrl = `http://127.0.0.1:${agentPort}/`;

  try {
    const response = await got(targetUrl);

    log(`Request successful, status: ${response.statusCode}`);
    res.json({
      success: true,
      statusCode: response.statusCode,
      url: targetUrl,
      bodyLength: response.body.length
    });
  } catch (error) {
    log(`Request failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      url: targetUrl
    });
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
