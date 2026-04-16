/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */
/* eslint-disable instana/no-unsafe-require */
/* eslint-disable import/no-extraneous-dependencies */

'use strict';

const process = require('process');

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');

const metricExporter = new OTLPMetricExporter();

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'otel kafka consumer app'
});

const sdk = new opentelemetry.NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter(),
  metricExporter,
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
    retries: 0
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
