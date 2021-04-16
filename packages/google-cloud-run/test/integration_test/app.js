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
  fetch(downstreamDummyUrl).then(() => {
    res.end(
      JSON.stringify({
        message: 'Hello Google Cloud Run!',
        env: {
          CLOUD_ACCESS_KEY: process.env.CLOUD_ACCESS_KEY,
          DB_PASSWORD_ABC: process.env.CLOUD_ACCESS_KEY,
          verysecretenvvar: process.env.verysecretenvvar,
          ANOTHER_ENV_VAR: process.env.ANOTHER_ENV_VAR,
          CONFIDENTIAL: process.env.CONFIDENTIAL,
          confidential: process.env.confidential
        }
      })
    );
  });
});

app.listen(port, () => {
  sendToParent('cloud-run-service: listening');
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
