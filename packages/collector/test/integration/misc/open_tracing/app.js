/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('@instana/collector');

instana({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  serviceName: 'theFancyServiceYouWouldntBelieveActuallyExists',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1,
    automaticTracingEnabled: process.env.DISABLE_AUTOMATIC_TRACING === 'false'
  }
});
const port = require('@_local/collector/test/test_util/app-port')();
const opentracing = require('opentracing');
const express = require('express');
const app = express();

opentracing.initGlobalTracer(instana.opentracing.createTracer());
const tracer = opentracing.globalTracer();

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/withOpentracing', (req, res) => {
  const serviceSpan = tracer.startSpan('service');
  serviceSpan.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_SERVER);
  const authSpan = tracer.startSpan('auth', { childOf: serviceSpan });
  authSpan.finish();
  serviceSpan.finish();
  res.send('OK');
});

app.get('/withOpentracingConnectedToInstanaTrace', (req, res) => {
  const spanContext = instana.opentracing.getCurrentlyActiveInstanaSpanContext();
  const serviceSpan = tracer.startSpan('service', { childOf: spanContext });
  serviceSpan.finish();
  res.send('OK');
});

app.get('/getCurrentlyActiveInstanaSpanContext', (req, res) => {
  res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express OT App (${process.pid}):\t${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
