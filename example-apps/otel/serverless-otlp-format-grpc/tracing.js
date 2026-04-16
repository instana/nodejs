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
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// 1. Setup
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';
const metadata = new grpc.Metadata();
metadata.set('x-instana-key', process.env.INSTANA_KEY);

// 2. Reader definieren
const instanaReader = new PeriodicExportingMetricReader({
  exportIntervalMillis: 1000 * 10,
  exporter: new OTLPMetricExporter({
    url: otlpEndpoint,
    metadata
  })
});

const consoleReader = new PeriodicExportingMetricReader({
  exportIntervalMillis: 1000 * 5,
  exporter: new ConsoleMetricExporter()
});

// 3. SDK Initialisierung
// Hinweis: Wir nutzen hier 'metricReader' (Singular),
// übergeben aber den instanaReader als Haupt-Reader.
const sdk = new opentelemetry.NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-node-host-service'
  }),
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

// 4. SDK Starten
sdk.start();

// Da NodeSDK den ConsoleReader nicht einfach "on the fly" per addMetricReader schluckt,
// registrieren wir ihn manuell am globalen MeterProvider, falls du ihn wirklich
// parallel zur Konsole brauchst. Einfacher zum Testen:
// Tausche oben einfach 'instanaReader' gegen 'consoleReader' aus, um sicherzugehen.

// 5. Host Metrics
const hostMetrics = new HostMetrics({
  meterProvider: metrics.getMeterProvider(),
  name: 'host-stats'
});

hostMetrics.start();

console.log(`
====================================
SDK gestartet auf Node ${process.version}
Sende an: ${otlpEndpoint}
====================================
`);
