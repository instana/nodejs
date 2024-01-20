/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('./tracing');
const express = require('express');
const port = process.env.PORT || '6215';
const fetch = require('node-fetch');
const logPrefix = `OpenTelemetry test app (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const { delay } = require('@instana/core/test/test_util');
const { sendToParent } = require('@instana/core/test/test_util');

/**
 * OpenTelemetry instrumentation does not work properly with node-fetch:
 * https://github.com/open-telemetry/opentelemetry-js/issues/1315
 */

const app = express();

app.get('/otel-test', (_req, res) => {
  delay(500)
    .then(() => fetch('https://www.example.com'))
    .then(text => {
      res.send({ ok: true, data: `${text.substr(0, 10)}...` });
    })
    .catch(err => {
      res.status(500).send({ error: err });
    });
});

app.post('/otel-post', (_req, res) => {
  delay(500)
    .then(() => fetch('https://www.example.com'))
    .then(text => {
      res.send({ ok: true, data: `${text.substr(0, 10)}...` });
    })
    .catch(err => {
      res.status(500).send({ error: err });
    });
});

app.listen(port, () => {
  log(`webserver started at port ${port}`);
  sendToParent('runtime: started');
});
