/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const http = require('http');

const { sendToParent } = require('@_local/core/test/test_util');

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

const port = process.env.TASK_HTTP_PORT;

const app = new http.Server();

app.on('request', (req, res) => {
  // eslint-disable-next-line no-console
  console.log('[Fargate App] Got request');

  fetch(downstreamDummyUrl, {
    headers: {
      'X-Exit-Request-Header-1': 'exit request header value 1',
      'X-Exit-Request-Header-2': ['exit', 'request', 'header', 'value 2'],
      'X-Exit-Request-Header-3': 'not configured to be captured',
      'X-Exit-Request-Header-4': ['not', 'configured', 'to', 'be', 'captured']
    }
  }).then(() => {
    res.setHeader('X-Entry-Response-Header-1', 'entry response header value 1');
    res.setHeader('X-Entry-Response-Header-2', ['entry', 'response', 'header', 'value 2']);
    res.setHeader('X-Entry-Response-Header-3', 'not configured to be captured');
    res.setHeader('X-Entry-Response-Header-4', ['not', 'configured', 'to', 'be', 'captured']);
    const responsePayload = JSON.stringify({
      message: 'Hello Fargate!',
      env: {
        CLOUD_ACCESS_KEY: process.env.CLOUD_ACCESS_KEY,
        DB_PASSWORD_ABC: process.env.CLOUD_ACCESS_KEY,
        verysecretenvvar: process.env.verysecretenvvar,
        ANOTHER_ENV_VAR: process.env.ANOTHER_ENV_VAR,
        CONFIDENTIAL: process.env.CONFIDENTIAL,
        confidential: process.env.confidential
      }
    });
    res.end(responsePayload);
  });
});

app.listen(port, () => {
  sendToParent('fargate-task: listening');
  // eslint-disable-next-line no-console
  console.log(`[Fargate App] Listening on port ${port}.`);
});
