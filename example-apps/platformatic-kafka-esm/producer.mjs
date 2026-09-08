/*
 * (c) Copyright IBM Corp. 2025
 */

/**
 * Kafka producer using @platformatic/kafka (ESM).
 *
 * Instrumented via @instana/collector/esm-register.mjs loaded with --import:
 *   node --import @instana/collector/esm-register.mjs producer.mjs
 *
 */

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect?.();
  process.exit(0);
});

import express from 'express';
import { Producer, stringSerializers } from '@platformatic/kafka';

const port = parseInt(process.env.APP_PORT || '3000', 10);
const bootstrapBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const topic = process.env.KAFKA_TOPIC || 'test-topic';

const logPrefix = `[platformatic-kafka-esm producer (${process.pid})]`;

function log(...args) {
  args[0] = `${logPrefix} ${args[0]}`;
  // eslint-disable-next-line no-console
  console.log(...args);
}

const producer = new Producer({
  clientId: 'esm-example-producer',
  bootstrapBrokers,
  serializers: stringSerializers
});

let connected = false;

async function connect() {
  try {
    // @platformatic/kafka connects lazily on first send; calling metadata triggers the connection.
    await producer.metadata({ topics: [topic] });
    connected = true;
    log('Producer ready.');
  } catch (err) {
    log('Producer connection error:', err.message);
  }
}

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.sendStatus(503);
  }
});

/**
 * POST /send
 * Body: { key?: string, value?: string }
 *
 * Sends a single message to the configured Kafka topic.
 */
app.post('/send', async (req, res) => {
  const { key = 'default-key', value = `message-${Date.now()}` } = req.body ?? {};

  log(`Sending message key=${key} value=${value}`);

  try {
    await producer.send({
      messages: [{ topic, key, value }]
    });

    log('Message sent.');
    res.json({ sent: true, topic, key, value });
  } catch (err) {
    log('Send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, async () => {
  log(`Listening on port ${port}`);
  await connect();
});
