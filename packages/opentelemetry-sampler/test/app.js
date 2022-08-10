/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const nock = require('nock');
const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
let otelSpans = [];

if (otelEndpoint) {
  nock(otelEndpoint)
    .post('/')
    .reply(200, (uri, requestBody, cb) => {
      requestBody.resourceSpans[0].scopeSpans.forEach(obj => {
        otelSpans = otelSpans.concat(obj.spans);
      });
      cb();
    });
}

require('./tracing');

const express = require('express');
const port = process.env.PORT || '8215';
const request = require('request-promise');
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
    .then(() => request('https://www.instana.com'))
    .then(() => {
      res.status(200).json({ success: true });
    })
    .catch(err => {
      res.status(500).json({ error: err });
    });
});

app.get('/get-otel-spans', (_req, res) => {
  const MAX_WAIT_MS = 1000 * 7;
  const startMs = Date.now();

  (async function waiting() {
    const endMs = Date.now();

    if (endMs - startMs >= MAX_WAIT_MS) {
      return res.json({ spans: otelSpans });
    }

    if (otelSpans.length !== 0) {
      return res.json({ spans: otelSpans });
    }

    setTimeout(waiting, 1000);
  })();
});

app.post('/otel-post', (_req, res) => {
  delay(500)
    .then(() => request('https://www.instana.com'))
    .then(() => {
      res.status(200).json({ success: true });
    })
    .catch(err => {
      res.status(500).json({ error: err });
    });
});

app.listen(port, () => {
  log(`webserver started at port ${port}`);
  sendToParent('runtime: started');
});
