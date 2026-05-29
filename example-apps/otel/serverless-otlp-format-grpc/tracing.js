/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const grpc = require('@grpc/grpc-js');
const { metrics } = require('@opentelemetry/api');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');
const { HostMetrics } = require('@opentelemetry/host-metrics');
const { InstanaPropagator } = require('@opentelemetry/propagator-instana');

const otlpEndpoint = process.env.INSTANA_ENDPOINT_URL;

if (!otlpEndpoint) {
  console.log('Please provide the OTLP serverless endpoint via "INSTANA_ENDPOINT_URL".');
  process.exit(-1);
}

const metadata = new grpc.Metadata();
metadata.set('x-instana-key', process.env.INSTANA_AGENT_KEY);

const instanaReader = new PeriodicExportingMetricReader({
  exportIntervalMillis: 1000 * 10,
  exporter: new OTLPMetricExporter({
    url: otlpEndpoint,
    metadata
  })
});

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
    metadata
  }),
  propagator: new InstanaPropagator(),
  metricReader: instanaReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }
    }),
    new KafkaJsInstrumentation()
  ]
});

sdk.start();

const hostMetrics = new HostMetrics({
  meterProvider: metrics.getMeterProvider(),
  name: 'host-stats'
});

hostMetrics.start();
