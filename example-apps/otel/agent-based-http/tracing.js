/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { metrics } = require('@opentelemetry/api');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');
const { HostMetrics } = require('@opentelemetry/host-metrics');
const { instanaAgentDetector } = require('@opentelemetry/resource-detector-instana');
const { processDetector, envDetector } = require('@opentelemetry/resources');
const { InstanaPropagator } = require('@opentelemetry/propagator-instana');

const otlpEndpoint = process.env.INSTANA_ENDPOINT_URL || 'http://127.0.0.1:4318';

const instanaReader = new PeriodicExportingMetricReader({
  exportIntervalMillis: 1000 * 10,
  exporter: new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`
  })
});

const sdk = new opentelemetry.NodeSDK({
  resourceDetectors: [envDetector, processDetector, instanaAgentDetector],
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`
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
