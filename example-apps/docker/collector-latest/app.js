/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

require('@instana/collector')({
  agentHost: 'host.docker.internal',
  agentPort: 42699
});

const express = require('express-v4');
const app = express();
const port = 3022;

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
