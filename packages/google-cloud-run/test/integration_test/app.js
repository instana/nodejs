/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const http = require('http');
const fetch = require('node-fetch');

const { sendToParent } = require('../../../core/test/test_util');

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

const port = process.env.PORT || 4216;

const app = new http.Server();

app.on('request', (req, res) => {
  fetch(downstreamDummyUrl).then(() => res.end('Hello Google Cloud Run!'));
});

app.listen(port, () => {
  sendToParent('cloud-run-service: listening');
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
