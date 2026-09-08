/*
 * (c) Copyright IBM Corp. 2025
 */

/**
 * Kafka consumer using @platformatic/kafka (ESM).
 *
 * Instrumented via @instana/collector/esm-register.mjs loaded with --import:
 *   node --import @instana/collector/esm-register.mjs consumer.mjs
 *
 */

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect?.();
  process.exit(0);
});

import express from 'express';
import { Consumer, stringDeserializers } from '@platformatic/kafka';
import { randomUUID } from 'node:crypto';

const port = parseInt(process.env.APP_PORT || '3001', 10);
const bootstrapBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const topic = process.env.KAFKA_TOPIC || 'test-topic';
// Each consumer run should join a unique group to receive all messages from the beginning.
const groupId = process.env.KAFKA_GROUP_ID || `esm-example-consumer-${randomUUID()}`;

const logPrefix = `[platformatic-kafka-esm consumer (${process.pid})]`;

function log(...args) {
  args[0] = `${logPrefix} ${args[0]}`;
  // eslint-disable-next-line no-console
  console.log(...args);
}

const consumer = new Consumer({
  clientId: 'esm-example-consumer',
  groupId,
  bootstrapBrokers,
  deserializers: stringDeserializers
});

const receivedMessages = [];
let connected = false;
let stream;

async function startConsuming() {
  try {
    stream = await consumer.consume({
      autocommit: true,
      topics: [topic],
      sessionTimeout: 10000,
      heartbeatInterval: 500
    });

    connected = true;
    log(`Consumer subscribed to topic "${topic}" with groupId "${groupId}".`);

    for await (const message of stream) {
      const key = message.key ?? '';
      const value = message.value ?? '';

      log(`Received message key=${key} value=${value}`);

      receivedMessages.push({ topic: message.topic, key, value });
    }
  } catch (err) {
    log('Consumer error:', err.message);
  }
}

const app = express();

app.get('/', (_req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.sendStatus(503);
  }
});

app.get('/messages', (_req, res) => {
  res.json(receivedMessages);
});

app.delete('/messages', (_req, res) => {
  receivedMessages.length = 0;
  res.sendStatus(204);
});

app.listen(port, () => {
  log(`Listening on port ${port}`);
  startConsuming();
});
