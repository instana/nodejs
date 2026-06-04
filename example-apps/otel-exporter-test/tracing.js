/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');

// ---------------------------------------------------
// OTel diagnostics
// ---------------------------------------------------

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// ---------------------------------------------------
// Resource
// ---------------------------------------------------

const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: 'test-sample-nodejs-app'
});

// ---------------------------------------------------
// Exporters
// ---------------------------------------------------

const instanaExporter = new OTLPTraceExporter({
  url: 'https://otlp-red-saas.instana.io:4318/v1/traces',
  headers: {
    'x-instana-key': process.env.INSTANA_AGENT_KEY
  }
});

const consoleExporter = new ConsoleSpanExporter();

// ---------------------------------------------------
// Provider
// ---------------------------------------------------

const provider = new NodeTracerProvider({
  resource,

  spanProcessors: [new BatchSpanProcessor(instanaExporter), new SimpleSpanProcessor(consoleExporter)]
});

// ---------------------------------------------------
// Register provider
// ---------------------------------------------------

provider.register();

// ---------------------------------------------------
// Instrumentations
// ---------------------------------------------------

registerInstrumentations({
  tracerProvider: provider,

  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false
      }
    }),

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
