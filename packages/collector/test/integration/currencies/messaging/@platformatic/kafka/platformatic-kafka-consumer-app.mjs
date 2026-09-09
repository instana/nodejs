/*
 * (c) Copyright IBM Corp. 2026
 */

process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import { randomUUID } from 'crypto';
import express from 'express';
import bodyParser from 'body-parser';
import delay from '@_local/core/test/test_util/delay.js';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
import { Consumer, MessagesStreamModes, stringDeserializers } from '@platformatic/kafka';
import { processWithTracing } from '@platformatic/kafka-opentelemetry';

const port = getAppPort();
const logPrefix = `[platformatic-kafka consumer (${process.pid})]`;

function log(...args) {
  args[0] = `${logPrefix} ${args[0]}`;
  // eslint-disable-next-line no-console
  console.log(...args);
}

const app = express();
app.use(bodyParser.json());

const bootstrapBrokers = (process.env.INSTANA_CONNECT_KAFKA || 'localhost:9092').split(',');
const topic = process.env.PLATFORMATIC_KAFKA_TOPIC || 'platformatic-kafka-topic';

let connected = false;

async function setupConsumer() {
  const consumer = new Consumer({
    clientId: `test-consumer-${randomUUID()}`,
    bootstrapBrokers,
    groupId: `test-consumer-group-${randomUUID()}`,
    sessionTimeout: 6000,
    rebalanceTimeout: 6000,
    heartbeatInterval: 1000,
    deserializers: stringDeserializers
  });

  const stream = await consumer.consume({
    topics: [topic],
    mode: MessagesStreamModes.LATEST,
    maxWaitTime: 1000
  });

  stream.on('data', async message => {
    log('Consumed message from topic', message.topic, message.value);

    await processWithTracing(message, async () => {
      await delay(50);
      await fetch(`http://127.0.0.1:${process.env.INSTANA_AGENT_PORT}/ping`);
    });
  });

  stream.on('error', err => {
    log('Consumer stream error:', err && err.message);
  });

  // Allow time for initial rebalance
  setTimeout(() => {
    connected = true;
    log('Consumer ready.');
  }, 3 * 1000);
}

app.get('/', (_req, res) => {
  if (connected) res.send('OK');
  else res.sendStatus(503);
});

app.get('/messages', (_req, res) => {
  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
  setupConsumer().catch(err => log('Consumer setup error:', err && err.message));
});
