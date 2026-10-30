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
instana({ tracing: { otlp: { enabled: true, port: agentPort } } });

const express = require('express');
const port = require('@_local/collector/test/test_util/app-port')();

const app = express();
app.get('/', (req, res) => res.sendStatus(200));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`OTLP metrics test app (${process.pid}) listening on port ${port}`);
});
