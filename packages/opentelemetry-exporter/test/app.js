/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/load_express_v4');

require('./tracing');
const express = require('express');
const fetch = require('node-fetch-v2');
const logPrefix = `OpenTelemetry test app (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const { delay } = require('@instana/core/test/test_util');
const { sendToParent } = require('@instana/core/test/test_util');

const getAppPort = require('@instana/collector/test/test_util/app-port');
const port = getAppPort();

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
