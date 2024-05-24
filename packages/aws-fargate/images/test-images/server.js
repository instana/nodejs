/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const http = require('http');
// Currently, we will only find the main package.json if the app has at least one dependency. This is because we check
// for the presence of a node_modules directory in the lookup code that heuristically finds the main package.json file.
// In Fargate, it is not 100% guaranteed that there is such a file, since @instana/aws-fargate is not added as a
// dependency but pre-required.
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
      .then(() => res.end('Hello Fargate!'))
      .catch(() => res.end('Hello Fargate!'));
  } else {
    res.end('Hello Fargate!');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
