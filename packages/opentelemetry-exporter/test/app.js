/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// require('./tracing');
const express = require('express');
const port = process.env.PORT || '9090';
const fetch = require('node-fetch');
const logPrefix = `OpenTelemetry test app (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const app = express();

app.get('/otel-test', (req, res) => {
  // setTimeout(async () => {
  fetch('https://instana.com')
    .then(response => response.text())
    .then(text => {
      res.send({ ok: true, data: text.substr(0, 10) + '...' });
    });
  // }, 500);
});

app.post('/otel-post', (req, res) => {
  res.send({ ok: 'post received!' });
});

app.listen(port, () => log(`webserver started at port ${port}`));
