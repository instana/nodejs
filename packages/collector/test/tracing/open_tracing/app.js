/* eslint-disable */

'use strict';

const instana = require('../../../');
instana({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  serviceName: 'theFancyServiceYouWouldntBelieveActuallyExists',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1,
    disableAutomaticTracing: process.env.DISABLE_AUTOMATIC_TRACING === 'true'
  }
});

const opentracing = require('opentracing');
const express = require('express');
const app = express();

opentracing.initGlobalTracer(instana.opentracing.createTracer());
const tracer = opentracing.globalTracer();

app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/withOpentracing', (req, res) => {
  log('########################## Start span!');
  const serviceSpan = tracer.startSpan('service');
  log('########################## Started span:', serviceSpan);
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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express OT App (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
