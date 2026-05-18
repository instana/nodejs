/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// ---------------------------------------------------
// Explicit instrumentations
// ---------------------------------------------------

const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');

// ---------------------------------------------------
// OTel internal logs
// ---------------------------------------------------

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// ---------------------------------------------------
// Provider
// ---------------------------------------------------

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'test-sample-nodejs-app'
  })
});

// ---------------------------------------------------
// Exporters
// ---------------------------------------------------

const instanaExporter = new OTLPTraceExporter({
  url: 'https://otlp-red-saas.instana.io:4318/v1/traces',
  headers: {
    'x-instana-key': 'nqtbV5cEQ5ev0MFzOIwskg'
  }
});

const consoleExporter = new ConsoleSpanExporter();

// ---------------------------------------------------
// Span processors
// ---------------------------------------------------

provider.addSpanProcessor(new BatchSpanProcessor(instanaExporter));
provider.addSpanProcessor(new SimpleSpanProcessor(consoleExporter));

// ---------------------------------------------------
// Register provider
// ---------------------------------------------------

provider.register();

// ---------------------------------------------------
// Instrumentations
// ---------------------------------------------------

registerInstrumentations({
  instrumentations: [
    // Generic node auto instrumentation
    getNodeAutoInstrumentations({
      // optional noisy instrumentations disable
      '@opentelemetry/instrumentation-fs': {
        enabled: false
      }
    }),

    // Explicit instrumentations
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
    new KafkaJsInstrumentation({
      producerHook: (span, info) => {
        span.setAttribute('messaging.custom.producer', true);
        span.setAttribute('messaging.destination.name', info.topic);
      },
      consumerHook: (span, info) => {
        span.setAttribute('messaging.custom.consumer', true);
        span.setAttribute('messaging.destination.name', info.topic);
      }
    })
  ]
});

// eslint-disable-next-line no-console
console.log('OpenTelemetry initialized');

// Made with Bob
