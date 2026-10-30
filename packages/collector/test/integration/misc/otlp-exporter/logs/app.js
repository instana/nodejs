/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('@instana/collector');

const agentPort = process.env.INSTANA_AGENT_PORT ? parseInt(process.env.INSTANA_AGENT_PORT, 10) : 42699;
instana({ tracing: { otlp: { enabled: process.env.OTLP_DISABLED !== 'true', port: agentPort } } });

const express = require('express');
const port = require('@_local/collector/test/test_util/app-port')();
const app = express();

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/warn', (req, res) => {
  console.warn('OTLP log test - warn message');
  res.send('OK');
});

app.get('/error', (req, res) => {
  console.error('OTLP log test - error message');
  res.send('OK');
});

app.listen(port, () => {
  console.log(`Listening on port: ${port}`);
});
