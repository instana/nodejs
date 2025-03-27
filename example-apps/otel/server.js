/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */
/* eslint-disable instana/no-unsafe-require */
/* eslint-disable import/no-extraneous-dependencies */

'use strict';

const process = require('process');
const { ExportResultCode } = require('@opentelemetry/core');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
// const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
// const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
// const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BasicTracerProvider, TraceIdRatioBasedSampler, ParentBasedSampler } = require('@opentelemetry/sdk-trace-base');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');
const { InstanaExporter } = require('@instana/opentelemetry-exporter');
const instanaTraceExporter = new InstanaExporter();

class CustomMetricsExporter {
  export(data, resultCallback) {
    console.log('CustomMetricsExporter.export', data.resource);

    data.scopeMetrics.forEach(scope => {
      console.log('CustomMetricsExporter.export', scope);
    });
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown() {
    console.log('CustomMetricsExporter.shutdown');
  }
}

const customMetricsExporter = new CustomMetricsExporter();

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'js standalone app'
});

const tracerProvider = new BasicTracerProvider({
  // See details of ParentBasedSampler below
  sampler: new ParentBasedSampler({
    // Trace ID Ratio Sampler accepts a positional argument
    // which represents the percentage of traces which should
    // be sampled.
    root: new TraceIdRatioBasedSampler(0.1)
  })
});

// tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(instanaTraceExporter));

const sdk = new opentelemetry.NodeSDK({
  resource,
  metricReader: new PeriodicExportingMetricReader({
    exporter: customMetricsExporter,
    exportIntervalMillis: 1000 * 5
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // NOTE: creates ~2.5k spans on bootstrap because node core reads node_modules
      '@opentelemetry/instrumentation-fs': { enabled: false }
    }),
    new KafkaJsInstrumentation()
  ]
});

tracerProvider.register();

sdk.start();

const { Kafka } = require('kafkajs');
const express = require('express-v4');
const port = process.env.PORT || '6215';
const app = express();

const broker = process.env.KAFKA_BROKER || '127.0.0.1:9092';
const kafkaTopic = 'otel-kafka-test-1';
const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: [broker],
  retry: {
    initialRetryTime: 500,
    retries: 0
  }
});

const producer = kafka.producer();

(async function connect() {
  await producer.connect();
})();

app.post('/kafka-msg', async (_req, res) => {
  await producer.send({
    topic: kafkaTopic,
    messages: [{ value: 'my-value' }]
  });

  res.status(200).send({ success: true });
});

app.get('/http', async (_req, res) => {
  await fetch('https://www.instana.com');
  res.status(200).send({ success: true });
});

app.listen(port, () => {
  console.log(`js standalone app started at port ${port}`);
});

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch(error => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
