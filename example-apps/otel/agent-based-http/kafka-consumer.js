/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable no-console */
/* eslint-disable instana/no-unsafe-require */
/* eslint-disable import/no-extraneous-dependencies */

'use strict';

const process = require('process');

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { processDetector, envDetector } = require('@opentelemetry/resources');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');

const sdk = new opentelemetry.NodeSDK({
  resourceDetectors: [envDetector, processDetector],
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter()
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // NOTE: creates ~2.5k spans on bootstrap because node core reads node_modules
      '@opentelemetry/instrumentation-fs': { enabled: false }
    }),
    new KafkaJsInstrumentation()
  ]
});

sdk.start();

const { Kafka } = require('kafkajs');
const broker = process.env.KAFKA_BROKER || '127.0.0.1:9092';
const kafkaTopic = 'otel-kafka-test-1';
const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: [broker],
  retry: {
    initialRetryTime: 500,
    retries: 5
  }
});

const consumer = kafka.consumer({ groupId: 'test-group' });

(async function connect() {
  await consumer.connect();

  await consumer.subscribe({ topic: kafkaTopic });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      console.log(`Received message ${message.value.toString()} on topic ${topic}`);
    }
  });
})();
