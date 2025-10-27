/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { FsInstrumentation } = require('@opentelemetry/instrumentation-fs');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const api = require('@opentelemetry/api');

const provider = new NodeTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'otel-sdk-test-service'
  })
});

provider.register();

registerInstrumentations({
  instrumentations: [new HttpInstrumentation(), new FsInstrumentation()]
});

const tracer = api.trace.getTracer('otel-sdk-app-tracer');

require('../../../../src')();

const express = require('express');
const fs = require('fs');
const path = require('path');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `OTel SDK App (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/otel-sdk-fs', (req, res) => {
  // To verify the OpenTelemetry SDK is active, we create an explicit span
  // We assert in the test that this span is present in the response
  const span = tracer.startSpan('explicit-otel-operation');

  try {
    // Use fs operation which should be traced by both OpenTelemetry SDK and Instana
    const content = fs.readFileSync(path.join(__dirname, '../test.js'), 'utf8');
    log(`Read file with size: ${content.length}`);

    const stats = fs.statSync(path.join(__dirname, '../test.js'));
    log(`File stats: ${JSON.stringify(stats.size)}`);
    span.end();
    res.send({ success: true, size: content.length, otelspan: span });
  } catch (err) {
    span.recordException(err);
    span.end();
    res.status(500).send({ error: err.message });
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
