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
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');
const { HostMetrics } = require('@opentelemetry/host-metrics');

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';
const metadata = new grpc.Metadata();
metadata.set('x-instana-key', process.env.INSTANA_KEY);

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
  // Das SDK akzeptiert hier einen Reader.
  // Um beide zu nutzen, ohne komplexe Provider-Logik:
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
