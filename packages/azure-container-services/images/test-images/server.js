/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const http = require('http');
if (Number(process.versions.node.split('.')[0]) < 18) {
  // eslint-disable-next-line no-console
  console.error('Node.js version 18 or higher is required.');
  return;
}

const app = new http.Server();
// eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
const getAppPort = require('@instana/collector/test/test_util/app-port');
const port = getAppPort();

const disableDownstreamRequests = process.env.DISABLE_DOWNSTREAM_REQUESTS === 'false';

app.on('request', (req, res) => {
  // eslint-disable-next-line no-console
  console.log('incoming request');
  if (!disableDownstreamRequests && Math.random() >= 0.7) {
    // eslint-disable-next-line no-console
    console.log('outgoing request');
    fetch('http://example.com')
      .then(() => res.end('Hello Azure!'))
      .catch(() => res.end('Hello Azure!'));
  } else {
    res.end('Hello Azure!');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
