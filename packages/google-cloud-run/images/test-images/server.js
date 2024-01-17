/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const http = require('http');

const fetch = require('node-fetch');

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
      .then(() => res.end('Hello Google Cloud Run!'))
      .catch(() => res.end('Hello Google Cloud Run!'));
  } else {
    res.end('Hello Google Cloud Run!');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
