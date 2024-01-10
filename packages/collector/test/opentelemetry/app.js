/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable no-console */

'use strict';

const initOtel = () => {
  const opentelemetry = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { Resource } = require('@opentelemetry/resources');
  const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
  const nodeAutoInstrumentations = getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: false
    }
  });
  const traceOtlpExporter = new OTLPTraceExporter({
    url: `http://localhost:${process.env.SPAN_RECEIVER_PORT}/v1/traces`
  });

  const spanProcessor = new BatchSpanProcessor(traceOtlpExporter, {
    scheduledDelayMillis: 100
  });

  const sdk = new opentelemetry.NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'my-service'
    }),
    spanProcessor: spanProcessor,
    instrumentations: [nodeAutoInstrumentations]
  });

  sdk.start();
};

if (process.env.INSTANA_LOAD_FIRST === 'true') {
  require('../../src')({
    tracing: {
      useOpentelemetry: false
    }
  });
  initOtel();
} else {
  initOtel();
  require('../../src')({
    tracing: {
      useOpentelemetry: false
    }
  });
}

require('mysql');
require('mysql2');
require('ioredis');
require('mongoose');
require('pg');
require('fs');
require('amqplib');
require('fastify');
require('express');
// NOTE: this is 3.x
//       4.x throws shimmer problems
require('mongodb');

const express = require('express');
const port = require('../test_util/app-port')();
const app = express();

const logPrefix = `Opentelemetry Usage App (${process.pid}):\t`;
app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/trace', (req, res) => {
  log('Received /trace request');
  res.send();
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
