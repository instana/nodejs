/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');
const { InstanaExporter } = require('@instana/opentelemetry-exporter');

const instanaTraceExporter = new InstanaExporter();

const sdk = new opentelemetry.NodeSDK({
  traceExporter: instanaTraceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }
    }),
    new KafkaJsInstrumentation()
  ]
});

sdk.start();
