/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instanaConfig =
  process.env.USE_INCODE_SECRETS_CONFIG === 'true'
    ? {
        secrets: {
          matcherMode: 'equals',
          keywords: ['incodeToken']
        }
      }
    : {};

require('@instana/collector')(instanaConfig);

const express = require('express');
const port = require('@_local/collector/test/test_util/app-port')();
const app = express();

const logPrefix = `Secrets Config Precedence Test (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
