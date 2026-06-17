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

if (process.env.OTLP_ENABLED_IN_CODE === 'true') {
  instana({
    tracing: {
      otlp: {
        enabled: true
      }
    }
  });
} else {
  instana();
}

const express = require('express');
const port = require('@_local/collector/test/test_util/app-port')();
const app = express();

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  console.log(`Listening on port: ${port}`);
});
